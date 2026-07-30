/* E2E for the GPS delivery timeline + admin live view (live DB + dev-bridge HTTP).
   Seeds an exec on an OPEN shift with a stored GPS track, then:
     • actualLegKmBetween sums the honest segments of an arbitrary window
     • POST stop {status:reached}  → Delivery.reachedAt stamped (once)
     • POST stop {deliver}         → Delivery.actualLegKm = GPS leg travelled
     • GET  my-route               → the stop exposes reachedAt + actualLegKm
     • GET  admin live-tracking    → the exec shows live position + distance so far
   bottlesOut:0 → zero fleet-inventory impact. Needs `npm run dev` on :3000.
   Creates + deletes everything. Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-gps-timeline.ts */
import { PrismaClient } from "@prisma/client";
import { actualLegKmBetween, recomputeShiftDistance } from "../lib/delivery/gps-track";
import { haversineKm } from "../lib/warehouse/distance";

const db = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "GPS-TL-E2E";
const stamp = Date.now();
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps;
let userId = "", driverId = "", shiftId = "", deliveryId = "";

function http(path: string, method: "GET" | "POST", actorRole: string, actorId: string, body?: unknown) {
  return fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4173", "X-Doodly-Actor": actorRole, "X-Doodly-Actor-Id": actorId },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => null)) as any }));
}
const data = (r: { json: any }) => (r.json && (r.json.data ?? r.json)) || {};

const LAT = 16.5;
const now = Date.now();
const startedAt = new Date(now - 40 * 60_000);
// 20 GPS fixes, one/min, ~96 m apart — every segment honest
const pts = Array.from({ length: 20 }, (_, k) => ({ lat: LAT, lng: 80.6 + k * 0.0009, capturedAt: new Date(startedAt.getTime() + k * 60_000) }));
const seg = (a: { lng: number }, b: { lng: number }) => haversineKm({ lat: LAT, lng: a.lng }, { lat: LAT, lng: b.lng });
let expectedTotal = 0; for (let i = 1; i < pts.length; i++) expectedTotal += seg(pts[i - 1], pts[i]);
let expectedSub = 0; for (let i = 6; i <= 10; i++) expectedSub += seg(pts[i - 1], pts[i]);   // window [p5, p10]

async function run() {
  const u = await db.user.create({ data: { name: `${TAG} Exec ${stamp}`, role: "DELIVERY_EXECUTIVE", email: `gps-tl-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: `GPSTL-${stamp}`, lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng, lastSeenAt: new Date() } });
  driverId = drv.id;
  const shift = await db.shift.create({ data: { driverId, status: "OPEN", startedAt, plannedDistanceKm: 10 } });
  shiftId = shift.id;
  await db.shiftGpsPoint.createMany({ data: pts.map((p, i) => ({ shiftId, driverId, lat: p.lat, lng: p.lng, capturedAt: p.capturedAt, clientId: `${TAG}-${stamp}-${i}` })) });
  const total = await recomputeShiftDistance(shiftId);   // sets shift.actualDistanceKm

  // ---- Part A: leg math ----
  const legAll = await actualLegKmBetween(shiftId, startedAt, new Date(now));
  ok("actualLegKmBetween(whole shift) = full track distance", near(legAll, expectedTotal), `got ${legAll} vs ${expectedTotal.toFixed(2)}`);
  const legSub = await actualLegKmBetween(shiftId, pts[5].capturedAt, pts[10].capturedAt);
  ok("actualLegKmBetween(sub-window) = only that window's segments", near(legSub, expectedSub), `got ${legSub} vs ${expectedSub.toFixed(2)}`);
  ok("recomputeShiftDistance matches full track", near(total, expectedTotal), `got ${total} vs ${expectedTotal.toFixed(2)}`);

  // ---- Part B: stop timeline over HTTP (as the exec) ----
  const del = await db.delivery.create({ data: { driverId, date: new Date(), status: "SCHEDULED", bottleCount: 1, sequence: 1 } });
  deliveryId = del.id;

  const reached = await http(`/api/delivery/stop/${del.id}`, "POST", "delivery_executive", userId, { action: "status", status: "reached" });
  const afterReach = await db.delivery.findUnique({ where: { id: del.id }, select: { status: true, reachedAt: true } });
  ok("POST stop {reached} stamps arrival (reachedAt) + REACHED", reached.status === 200 && afterReach?.status === "REACHED" && !!afterReach?.reachedAt, JSON.stringify({ status: reached.status, reachedAt: afterReach?.reachedAt }));

  const delivered = await http(`/api/delivery/stop/${del.id}`, "POST", "delivery_executive", userId, { action: "deliver", bottles: 0, bottlesOut: 0 });
  const afterDeliver = await db.delivery.findUnique({ where: { id: del.id }, select: { status: true, actualLegKm: true, deliveredAt: true } });
  ok("POST stop {deliver} → DELIVERED + deliveredAt", delivered.status === 200 && afterDeliver?.status === "DELIVERED" && !!afterDeliver?.deliveredAt, JSON.stringify({ status: delivered.status, s: afterDeliver?.status }));
  ok("actualLegKm computed from GPS (first stop: warehouse-departure → arrival)", afterDeliver?.actualLegKm != null && near(afterDeliver.actualLegKm, expectedTotal, 0.1), `got ${afterDeliver?.actualLegKm} vs ~${expectedTotal.toFixed(2)}`);

  const route = await http(`/api/delivery/my-route`, "GET", "delivery_executive", userId);
  const stops = (data(route).stops || []) as any[];
  const stop = stops.find((s) => s.id === del.id);
  ok("my-route exposes the stop's reachedAt + actualLegKm", !!stop && !!stop.reachedAt && stop.actualLegKm != null, JSON.stringify(stop ? { reachedAt: stop.reachedAt, actualLegKm: stop.actualLegKm } : null));

  // ---- Part C: admin live-tracking view ----
  const live = await http(`/api/admin/deliveries/live-tracking`, "GET", "super_admin", "dev-super");
  const execs = (data(live).execs || []) as any[];
  const mine = execs.find((e) => e.driverId === driverId);
  ok("live-tracking lists the on-shift exec with a fresh GPS fix", !!mine && mine.hasFix === true && mine.gpsAgeSec != null, JSON.stringify(mine ? { hasFix: mine.hasFix, age: mine.gpsAgeSec } : null));
  ok("live-tracking reports distance so far + planned + progress", !!mine && near(mine.actualDistanceKm, expectedTotal, 0.1) && mine.plannedKm === 10 && mine.deliveries.total >= 1, JSON.stringify(mine ? { actual: mine.actualDistanceKm, planned: mine.plannedKm, del: mine.deliveries } : null));
}

async function cleanup() {
  try {
    if (deliveryId) { await db.bottleLedger.deleteMany({ where: { deliveryId } }).catch(() => {}); await db.delivery.deleteMany({ where: { id: deliveryId } }).catch(() => {}); }
    if (driverId) {
      await db.shiftGpsPoint.deleteMany({ where: { driverId } }).catch(() => {});
      await db.shift.deleteMany({ where: { driverId } }).catch(() => {});
      await db.delivery.deleteMany({ where: { driverId } }).catch(() => {});
      await db.executiveStatus.deleteMany({ where: { driverId } }).catch(() => {});
      await db.assignmentLog.deleteMany({ where: { driverId } }).catch(() => {});
      await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {});
    }
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== GPS timeline + live-view E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
