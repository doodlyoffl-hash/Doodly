/* HTTP-contract E2E for the exec GPS tracking surfaces the static client depends on.
   Drives the REAL endpoints on http://localhost:3000 via the dev-bridge headers
   (Origin :4173 + X-Doodly-Actor) exactly as assets/js/delivery.js does:
     GET  /api/driver/availability   → gpsConfig present (cadence + filters)
     POST /api/driver/availability   → shift opens + start location stamped
     POST /api/delivery/track        → batch ingested, fraud-filtered km returned
     POST /api/delivery/track (again)→ replay dedups (no double count)
     POST /api/driver/availability   → shift closes, distance finalised + end location
   Creates + deletes its own throwaway exec. Needs `npm run dev` on :3000.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-gps-http.ts */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "GPS-HTTP-E2E";
const stamp = Date.now();
let userId = "", driverId = "";

function api(path: string, method: "GET" | "POST", body?: unknown) {
  return fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:4173",
      "X-Doodly-Actor": "delivery_executive",
      "X-Doodly-Actor-Id": userId,
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) as any }));
}
const data = (r: { json: any }) => (r.json && (r.json.data ?? r.json)) || {};

const LAT = 16.5;
// a short clean eastbound track (~96 m / 6 s ≈ 57 km/h) — every segment honest
const base = new Date("2026-07-31T04:00:00.000Z").getTime();
const batch = [0, 1, 2, 3].map((i) => ({
  lat: LAT, lng: 80.6 + i * 0.0009, accuracyM: 8, speed: null,
  capturedAt: new Date(base + i * 6000).toISOString(), clientId: `${TAG}-${stamp}-${i}`,
}));

async function run() {
  const u = await db.user.create({ data: { name: `${TAG} Exec`, role: "DELIVERY_EXECUTIVE", email: `gps-http-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: `GPSH-${stamp}` } });
  driverId = drv.id;

  const g = await api("/api/driver/availability", "GET");
  const gd = data(g);
  ok("GET availability returns gpsConfig (cadence + client filters)", g.status === 200 && !!gd.gpsConfig && typeof gd.gpsConfig.sampleIntervalS === "number", JSON.stringify({ status: g.status, gpsConfig: gd.gpsConfig }));

  const on = await api("/api/driver/availability", "POST", { available: true, lat: LAT, lng: 80.6 });
  const ond = data(on);
  ok("POST availability opens a shift + stamps the start location", on.status === 200 && ond.shift && ond.shift.startLat === LAT && ond.shift.startLng === 80.6, JSON.stringify({ status: on.status, startLat: ond.shift && ond.shift.startLat }));

  const t1 = await api("/api/delivery/track", "POST", { points: batch });
  const t1d = data(t1);
  ok("POST /track ingests the batch + returns fraud-filtered distance", t1.status === 200 && t1d.accepted === 4 && t1d.actualDistanceKm > 0.2 && t1d.actualDistanceKm < 0.4, JSON.stringify({ status: t1.status, accepted: t1d.accepted, km: t1d.actualDistanceKm }));

  const g2 = await api("/api/driver/availability", "GET");
  const g2d = data(g2);
  ok("GET availability reflects the running actual distance", g2d.shift && Math.abs((g2d.shift.actualDistanceKm ?? 0) - (t1d.actualDistanceKm ?? -1)) < 0.011, JSON.stringify({ shiftKm: g2d.shift && g2d.shift.actualDistanceKm }));

  const t2 = await api("/api/delivery/track", "POST", { points: batch });
  const t2d = data(t2);
  ok("replaying the same batch dedups (0 accepted, distance unchanged)", t2.status === 200 && t2d.accepted === 0 && Math.abs(t2d.actualDistanceKm - t1d.actualDistanceKm) < 0.011, JSON.stringify({ accepted: t2d.accepted, km: t2d.actualDistanceKm }));

  const off = await api("/api/driver/availability", "POST", { available: false, lat: LAT, lng: 80.6027 });
  const offd = data(off);
  ok("POST availability closes the shift + stamps end location + finalises distance", off.status === 200 && offd.shift && offd.shift.status === "CLOSED" && offd.shift.endLat === LAT && Math.abs((offd.shift.actualDistanceKm ?? 0) - (t1d.actualDistanceKm ?? -1)) < 0.011, JSON.stringify({ status: offd.shift && offd.shift.status, endLat: offd.shift && offd.shift.endLat, km: offd.shift && offd.shift.actualDistanceKm }));
}

async function cleanup() {
  try {
    if (driverId) {
      await db.shiftGpsPoint.deleteMany({ where: { driverId } }).catch(() => {});
      await db.shift.deleteMany({ where: { driverId } }).catch(() => {});
      await db.tripHistory.deleteMany({ where: { driverId } }).catch(() => {});
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
    console.log(`\n=== GPS HTTP-contract E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
