/* E2E for the GPS distance-tracking engine (live DB, self-cleaning).
   Feeds a synthetic shift track that mixes clean driving with every fraud/noise
   case — GPS jitter (<minMoveM), a bad-accuracy fix (>maxAccuracyM), a teleport
   spike (>maxSpeedKmh), a long signal-loss gap (>maxGapS) and duplicate clientIds
   — and asserts the server counts ONLY the honest segments, dedups a replay, and
   that closeShift finalises actual + planned distance. Pins the tracking config to
   defaults for the run and restores it. Cleans up every seeded row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-gps-track.ts */
import { PrismaClient } from "@prisma/client";
import { openShift, closeShift, currentShift } from "../lib/delivery/shift";
import { ingestGpsPoints, recomputeShiftDistance } from "../lib/delivery/gps-track";
import { GPS_TRACKING_KEY, GPS_TRACKING_DEFAULTS, patchGpsTrackingConfig } from "../lib/delivery/gps-config";
import { haversineKm } from "../lib/warehouse/distance";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "GPS-E2E";
const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
const stamp = Date.now();
let userId = "", driverId = "", shiftId = "";
let priorCfg: unknown = undefined, hadCfg = false;

// A synthetic track: lat fixed, moving east. capturedAt is seconds from base.
const LAT = 16.5;
const base = new Date("2026-07-31T03:00:00.000Z").getTime();
type P = { lng: number; t: number; acc: number; id: string; kind: string };
const P = (lng: number, t: number, acc: number, kind: string): P => ({ lng, t, acc, id: `${TAG}-${stamp}-${kind}`, kind });
const track: P[] = [
  P(80.60000, 0, 10, "p0"),
  P(80.60090, 6, 10, "p1"),       // ~96 m  — counts
  P(80.60180, 12, 10, "p2"),      // ~96 m  — counts
  P(80.60270, 18, 10, "p3"),      // ~96 m  — counts
  P(80.602753, 24, 10, "jitter"), // ~5.6 m < minMoveM(8) — DROPPED, but becomes prev
  P(80.60360, 30, 10, "p5"),      // ~91 m from jitter — counts
  P(80.62000, 36, 250, "badacc"), // accuracy 250 > maxAccuracyM(100) — DROPPED before storage
  P(80.60450, 42, 10, "p7"),      // ~96 m from p5 (badacc removed) — counts
  P(80.70450, 48, 10, "teleport"),// +0.1° in 6 s → thousands of km/h > maxSpeedKmh — DROPPED, becomes prev
  P(80.70540, 448, 10, "gap"),    // 400 s gap > maxGapS(300) — DROPPED, becomes prev
  P(80.70630, 454, 10, "p10"),    // ~96 m from gap in 6 s — counts
];
const toRaw = (p: P) => ({ lat: LAT, lng: p.lng, accuracyM: p.acc, speed: null, capturedAt: new Date(base + p.t * 1000).toISOString(), clientId: p.id });

// Hand-computed expected clean distance = only the honest segments.
const seg = (a: P, b: P) => haversineKm({ lat: LAT, lng: a.lng }, { lat: LAT, lng: b.lng });
const g = (k: string) => track.find((p) => p.kind === k)!;
const expectedKm = round2(
  seg(g("p0"), g("p1")) + seg(g("p1"), g("p2")) + seg(g("p2"), g("p3")) +
  seg(g("jitter"), g("p5")) + seg(g("p5"), g("p7")) + seg(g("gap"), g("p10")),
);
// Naive (no filters) sum over the STORED points — dominated by the teleport (~21 km) → proves filtering.
const stored = track.filter((p) => p.kind !== "badacc");
let naiveKm = 0;
for (let i = 1; i < stored.length; i++) naiveKm += seg(stored[i - 1], stored[i]);

async function run() {
  // pin config → defaults for a deterministic run
  const row = await db.appSetting.findUnique({ where: { key: GPS_TRACKING_KEY } }).catch(() => null);
  hadCfg = !!row; priorCfg = row?.value;
  await patchGpsTrackingConfig(GPS_TRACKING_DEFAULTS);

  const u = await db.user.create({ data: { name: `${TAG} Exec`, role: "DELIVERY_EXECUTIVE", email: `gps-e2e-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: `GPS-${stamp}` } });
  driverId = drv.id;
  // a planned round-trip for the planned-vs-actual comparison at close
  await db.tripHistory.create({ data: { driverId, slot: "MORNING", date: new Date(base), plannedDistanceKm: 12.34 } }).catch((e) => console.error("trip seed:", (e as Error).message));

  // open with a start location
  const s = await openShift(driverId, { lat: LAT, lng: 80.6 });
  shiftId = s.id;
  ok("openShift stamps the start location", s.startLat === LAT && s.startLng === 80.6 && s.status === "OPEN", JSON.stringify({ startLat: s.startLat, startLng: s.startLng }));

  // first ingest
  const r1 = await ingestGpsPoints(driverId, track.map(toRaw));
  ok("ingest stores every valid point, drops the bad-accuracy fix (10 of 11)", r1.accepted === 10 && r1.gpsPointCount === 10, JSON.stringify(r1));
  ok("actualDistanceKm counts ONLY the honest segments", near(r1.actualDistanceKm, expectedKm), `got ${r1.actualDistanceKm} vs expected ${expectedKm}`);
  ok("fraud filters removed the teleport (~10.6 km spike excluded)", naiveKm - r1.actualDistanceKm > 9, `naive ${round2(naiveKm)} − actual ${r1.actualDistanceKm} = ${round2(naiveKm - r1.actualDistanceKm)} km filtered`);

  // replay the exact same batch → dedup, no double-count
  const r2 = await ingestGpsPoints(driverId, track.map(toRaw));
  ok("replaying the batch dedups (0 accepted, distance unchanged)", r2.accepted === 0 && near(r2.actualDistanceKm, expectedKm) && r2.gpsPointCount === 10, JSON.stringify(r2));

  // recompute from the full stored track → identical
  const rc = await recomputeShiftDistance(shiftId);
  ok("recomputeShiftDistance rebuilds the same distance", near(rc, expectedKm), `got ${rc} vs ${expectedKm}`);
  const cnt = await db.shiftGpsPoint.count({ where: { shiftId } });
  ok("exactly 10 track points persisted (bad-accuracy never stored)", cnt === 10, `count ${cnt}`);

  // close with an end location → finalises actual + planned
  const closed = await closeShift(driverId, { lat: LAT, lng: 80.7063 });
  ok("closeShift → CLOSED with end location", !!closed && closed.status === "CLOSED" && closed.endLat === LAT && closed.endLng === 80.7063, JSON.stringify(closed && { st: closed.status, endLat: closed.endLat }));
  ok("closed shift keeps the GPS actual distance", !!closed && near(closed.actualDistanceKm, expectedKm), JSON.stringify(closed && { actual: closed.actualDistanceKm }));
  ok("closed shift records planned distance (from TripHistory)", !!closed && closed.plannedDistanceKm === 12.34, JSON.stringify(closed && { planned: closed.plannedDistanceKm }));

  // no open shift now → ingestion is a no-op (never counts off-shift movement)
  const r3 = await ingestGpsPoints(driverId, [toRaw(P(80.8, 600, 10, "offshift"))]);
  ok("ingest with no open shift is a no-op", r3.accepted === 0 && r3.note === "no_shift", JSON.stringify(r3));
  ok("currentShift is null after close", (await currentShift(driverId)) === null);
}

async function cleanup() {
  try {
    if (shiftId) await db.shiftGpsPoint.deleteMany({ where: { shiftId } }).catch(() => {});
    if (driverId) await db.shiftGpsPoint.deleteMany({ where: { driverId } }).catch(() => {});
    if (driverId) await db.shift.deleteMany({ where: { driverId } }).catch(() => {});
    if (driverId) await db.tripHistory.deleteMany({ where: { driverId } }).catch(() => {});
    if (driverId) await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
    // restore the tracking config exactly as it was
    if (hadCfg) await db.appSetting.update({ where: { key: GPS_TRACKING_KEY }, data: { value: priorCfg as object } }).catch(() => {});
    else await db.appSetting.deleteMany({ where: { key: GPS_TRACKING_KEY } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== GPS distance-tracking E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
