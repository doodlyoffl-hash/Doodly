/* Runtime E2E — Automatic "Reached Customer" geofence detection (throwaway local
   Postgres, zero prod contact). Proves the server auto-flips an assigned ON_THE_WAY
   stop to REACHED when the exec dwells inside the customer's verified-pin geofence,
   records the arrival GPS proof, refuses every gate (no shift / not assigned / not
   on-the-way / weak accuracy / unverified pin), ignores a high-speed drive-past,
   is idempotent + offline-replay accurate, and NEVER marks a stop DELIVERED (manual).
   Run: node scripts/_devverify.mjs scripts/verify-geofence-reached.ts */
import { db } from "@/lib/db";
import { detectArrivals } from "@/lib/delivery/geofence";
import { openShift, closeShift } from "@/lib/delivery/shift";
import { GEOFENCE_KEY, GEOFENCE_DEFAULTS, patchGeofenceConfig } from "@/lib/delivery/geofence-config";
import { haversineKm } from "@/lib/warehouse/distance";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 7);

const TARGET = { lat: 16.5, lng: 80.6 };                 // the customer's verified pin
const base = new Date("2026-08-04T03:00:00.000Z").getTime();
const IN = 0.0003;    // ≈ 33 m north of the pin (inside a 50 m fence)
const OUT = 0.005;    // ≈ 556 m north (well outside)
type Raw = { lat: number; lng: number; accuracyM: number | null; speed: number | null; capturedAt: string; clientId: string };
const pt = (dLat: number, tSec: number, acc: number, id: string): Raw => ({ lat: TARGET.lat + dLat, lng: TARGET.lng, accuracyM: acc, speed: null, capturedAt: new Date(base + tSec * 1000).toISOString(), clientId: id });

let execUserId = "", driverId = "", custId = "", otherDriverId = "";
const ACTOR = () => ({ userId: execUserId, role: "delivery_executive" as const });

async function mkStop(opts: { verified?: boolean; driver?: string; status?: "ON_THE_WAY" | "ASSIGNED" } = {}) {
  const addr = await db.address.create({ data: { userId: custId, label: "Home", line1: "1 Test Rd", city: "Vijayawada", pincode: "520001", lat: TARGET.lat, lng: TARGET.lng, verified: opts.verified ?? true } });
  const del = await db.delivery.create({ data: { date: new Date(base), status: opts.status ?? "ON_THE_WAY", driverId: opts.driver ?? driverId, addressId: addr.id, bottleCount: 1, onThewayAt: new Date(base) } });
  return { delId: del.id, addrId: addr.id };
}
const load = (id: string) => db.delivery.findUnique({ where: { id } });
const auditCount = (action: string, needle: string) => db.auditLog.count({ where: { userId: execUserId, action, target: { contains: needle } } });

async function run() {
  await patchGeofenceConfig(GEOFENCE_DEFAULTS);            // pin radius 50 m · dwell 20 s · acc ≤50 m · verified-pin · ON

  const eu = await db.user.create({ data: { name: `GEOFENCE Exec ${rnd()}`, role: "DELIVERY_EXECUTIVE", email: `gf-exec-${rnd()}@doodly.test` } });
  execUserId = eu.id;
  driverId = (await db.driver.create({ data: { userId: eu.id, employeeId: `GF-${rnd()}` } })).id;
  const cu = await db.user.create({ data: { name: `GEOFENCE Cust ${rnd()}`, role: "CUSTOMER", email: `gf-cust-${rnd()}@doodly.test` } });
  custId = cu.id;
  const ou = await db.user.create({ data: { name: `GEOFENCE Other ${rnd()}`, role: "DELIVERY_EXECUTIVE", email: `gf-other-${rnd()}@doodly.test` } });
  otherDriverId = (await db.driver.create({ data: { userId: ou.id, employeeId: `GFO-${rnd()}` } })).id;

  await openShift(driverId, { lat: TARGET.lat, lng: TARGET.lng });   // exec is on shift

  // ---- Scenario 1: exec stays far from the pin → NO auto-reach ----
  {
    const { delId } = await mkStop();
    const ev = await detectArrivals(driverId, [pt(OUT, 0, 8, `s1-${rnd()}`), pt(OUT, 15, 8, `s1-${rnd()}`), pt(OUT, 30, 8, `s1-${rnd()}`)], ACTOR());
    const d = await load(delId);
    ok("S1: 500 m away → no arrival event, stop stays ON_THE_WAY", ev.length === 0 && d?.status === "ON_THE_WAY" && d?.geofenceEnteredAt == null, JSON.stringify({ ev: ev.length, status: d?.status }));
    await db.delivery.delete({ where: { id: delId } });
  }

  // ---- Scenario 2: within 50 m for ≥ dwell → AUTO-REACHED with GPS proof ----
  let s2Del = "";
  {
    const { delId } = await mkStop();
    s2Del = delId;
    const ev = await detectArrivals(driverId, [pt(IN, 0, 8, `s2a-${rnd()}`), pt(IN, 25, 8, `s2b-${rnd()}`)], ACTOR());
    const d = await load(delId);
    const expDist = Math.round(haversineKm({ lat: TARGET.lat + IN, lng: TARGET.lng }, TARGET) * 1000);
    ok("S2: dwell inside → exactly one arrival event for this stop", ev.length === 1 && ev[0].deliveryId === delId, JSON.stringify(ev));
    ok("S2: status auto-flipped to REACHED (reachedAuto=true)", d?.status === "REACHED" && d?.reachedAuto === true, JSON.stringify({ status: d?.status, auto: d?.reachedAuto }));
    ok("S2: arrival GPS proof recorded (distance≈33 m, accuracy, coords)", Math.abs((d?.reachedDistanceM ?? 0) - expDist) <= 2 && d?.reachedAccuracyM === 8 && d?.reachedLat != null && d?.reachedLng != null, JSON.stringify({ dist: d?.reachedDistanceM, exp: expDist, acc: d?.reachedAccuracyM }));
    ok("S2: reachedAt = the fix's true capturedAt (offline-accurate, not sync time)", d?.reachedAt?.toISOString() === new Date(base + 25 * 1000).toISOString(), String(d?.reachedAt?.toISOString()));
    ok("S2: NOT delivered — 'Delivered' stays a manual action", d?.deliveredAt == null && d?.status !== "DELIVERED", String(d?.status));
    ok("S2: audit wrote delivery.reached.auto for this stop", (await auditCount("delivery.reached.auto", delId)) === 1);
    ok("S2: audit wrote delivery.geofence.entered for this stop", (await auditCount("delivery.geofence.entered", delId)) >= 1);
  }

  // ---- Scenario 3: every safety gate refuses the auto-reach ----
  {
    // (a) weak GPS accuracy (>minAccuracyM) is ignored
    const a = await mkStop();
    const eA = await detectArrivals(driverId, [pt(IN, 0, 200, `s3a-${rnd()}`), pt(IN, 25, 200, `s3a-${rnd()}`)], ACTOR());
    const dA = await load(a.delId);
    ok("S3a: weak GPS accuracy (>50 m) → no auto-reach", eA.length === 0 && dA?.status === "ON_THE_WAY", JSON.stringify({ ev: eA.length, status: dA?.status }));
    await db.delivery.delete({ where: { id: a.delId } });

    // (b) unverified customer pin never auto-fires
    const b = await mkStop({ verified: false });
    const eB = await detectArrivals(driverId, [pt(IN, 0, 8, `s3b-${rnd()}`), pt(IN, 25, 8, `s3b-${rnd()}`)], ACTOR());
    const dB = await load(b.delId);
    ok("S3b: unverified pin → no auto-reach", eB.length === 0 && dB?.status === "ON_THE_WAY", JSON.stringify({ ev: eB.length, status: dB?.status }));
    await db.delivery.delete({ where: { id: b.delId } });

    // (c) a stop that isn't ON_THE_WAY is not a candidate
    const c = await mkStop({ status: "ASSIGNED" });
    const eC = await detectArrivals(driverId, [pt(IN, 0, 8, `s3c-${rnd()}`), pt(IN, 25, 8, `s3c-${rnd()}`)], ACTOR());
    const dC = await load(c.delId);
    ok("S3c: status not ON_THE_WAY → no auto-reach", eC.length === 0 && dC?.status === "ASSIGNED", String(dC?.status));
    await db.delivery.delete({ where: { id: c.delId } });

    // (d) a stop assigned to ANOTHER driver is never touched by this driver's stream
    const other = await mkStop({ driver: otherDriverId });
    const eD = await detectArrivals(driverId, [pt(IN, 0, 8, `s3d-${rnd()}`), pt(IN, 25, 8, `s3d-${rnd()}`)], ACTOR());
    const dD = await load(other.delId);
    ok("S3d: not assigned to this exec → no auto-reach", eD.length === 0 && dD?.status === "ON_THE_WAY", String(dD?.status));
    await db.delivery.delete({ where: { id: other.delId } });

    // (e) no OPEN shift → detection is a no-op
    const e = await mkStop();
    await closeShift(driverId);
    const eE = await detectArrivals(driverId, [pt(IN, 0, 8, `s3e-${rnd()}`), pt(IN, 25, 8, `s3e-${rnd()}`)], ACTOR());
    const dE = await load(e.delId);
    ok("S3e: exec not on shift → no auto-reach", eE.length === 0 && dE?.status === "ON_THE_WAY", String(dE?.status));
    await openShift(driverId, { lat: TARGET.lat, lng: TARGET.lng });   // resume shift
    await db.delivery.delete({ where: { id: e.delId } });
  }

  // ---- Scenario 4: dwell prevents a high-speed drive-past; dwell carries across batches ----
  {
    // (a) enters then immediately leaves before the dwell elapses → no reach
    const a = await mkStop();
    const eA = await detectArrivals(driverId, [pt(IN, 0, 8, `s4a-${rnd()}`), pt(OUT, 5, 8, `s4a-${rnd()}`)], ACTOR());
    const dA = await load(a.delId);
    ok("S4a: drive-past (in then out < dwell) → no reach, dwell clock reset", eA.length === 0 && dA?.status === "ON_THE_WAY" && dA?.geofenceEnteredAt == null, JSON.stringify({ ev: eA.length, entered: dA?.geofenceEnteredAt }));
    await db.delivery.delete({ where: { id: a.delId } });

    // (b) dwell accumulates across two separate track batches (offline/real cadence)
    const b = await mkStop();
    const b1 = await detectArrivals(driverId, [pt(IN, 0, 8, `s4b1-${rnd()}`)], ACTOR());     // enter — clock starts, no reach yet
    const dMid = await load(b.delId);
    ok("S4b: first batch inside → dwell clock armed, not yet reached", b1.length === 0 && dMid?.status === "ON_THE_WAY" && dMid?.geofenceEnteredAt != null, JSON.stringify({ ev: b1.length, entered: dMid?.geofenceEnteredAt?.toISOString() }));
    const b2 = await detectArrivals(driverId, [pt(IN, 25, 8, `s4b2-${rnd()}`)], ACTOR());     // still inside 25 s later → reach
    const dEnd = await load(b.delId);
    ok("S4b: dwell satisfied across batches → auto-reached", b2.length === 1 && dEnd?.status === "REACHED" && dEnd?.reachedAuto === true, JSON.stringify({ ev: b2.length, status: dEnd?.status }));
    await db.delivery.delete({ where: { id: b.delId } });
  }

  // ---- Scenario 5: idempotent + offline replay of the S2 batch never double-fires ----
  {
    const before = await load(s2Del);
    const ev = await detectArrivals(driverId, [pt(IN, 0, 8, `s2a-${rnd()}`), pt(IN, 25, 8, `s2b-${rnd()}`)], ACTOR());  // replay same arrival
    const after = await load(s2Del);
    ok("S5: replaying the arrival on an already-REACHED stop → no event", ev.length === 0, JSON.stringify(ev));
    ok("S5: reachedAt unchanged (first-wins, no double-stamp)", before?.reachedAt?.toISOString() === after?.reachedAt?.toISOString(), String(after?.reachedAt?.toISOString()));
    ok("S5: still exactly one reached.auto audit for the stop (no duplicate)", (await auditCount("delivery.reached.auto", s2Del)) === 1);
  }

  // ---- Scenario 6: a manual REACHED is flagged manual (reachedAuto=false) ----
  {
    const { delId } = await mkStop();
    await db.delivery.update({ where: { id: delId }, data: { status: "REACHED", reachedAt: new Date(base) } });   // simulate the manual button
    const d = await load(delId);
    ok("S6: manual reach → reachedAuto stays false (distinguishable from auto)", d?.status === "REACHED" && d?.reachedAuto === false, JSON.stringify({ status: d?.status, auto: d?.reachedAuto }));
    // detection must not touch an already-REACHED stop nor ever set DELIVERED
    const ev = await detectArrivals(driverId, [pt(IN, 0, 8, `s6-${rnd()}`), pt(IN, 25, 8, `s6-${rnd()}`)], ACTOR());
    const d2 = await load(delId);
    ok("S6: detection leaves the manual REACHED untouched, never auto-delivers", ev.length === 0 && d2?.status === "REACHED" && d2?.deliveredAt == null, JSON.stringify({ ev: ev.length, status: d2?.status }));
    await db.delivery.delete({ where: { id: delId } });
  }

  // ---- Invariant: nothing was ever auto-DELIVERED by the detector ----
  const delivered = await db.delivery.count({ where: { driverId, status: "DELIVERED" } });
  ok("Invariant: the geofence detector never marks a stop DELIVERED", delivered === 0, `delivered=${delivered}`);
}

async function cleanup() {
  try {
    for (const id of [driverId, otherDriverId]) if (id) await db.delivery.deleteMany({ where: { driverId: id } }).catch(() => {});
    if (custId) await db.address.deleteMany({ where: { userId: custId } }).catch(() => {});
    for (const id of [driverId, otherDriverId]) if (id) { await db.shiftGpsPoint.deleteMany({ where: { driverId: id } }).catch(() => {}); await db.shift.deleteMany({ where: { driverId: id } }).catch(() => {}); await db.driver.deleteMany({ where: { id } }).catch(() => {}); }
    if (execUserId) await db.auditLog.deleteMany({ where: { userId: execUserId } }).catch(() => {});
    for (const id of [execUserId, custId]) if (id) await db.user.deleteMany({ where: { id } }).catch(() => {});
    // otherDriver's user
    await db.user.deleteMany({ where: { email: { startsWith: "gf-other-" } } }).catch(() => {});
    await db.appSetting.deleteMany({ where: { key: GEOFENCE_KEY } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Automatic "Reached Customer" geofence E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
