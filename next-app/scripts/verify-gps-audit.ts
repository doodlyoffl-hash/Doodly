/* E2E for the GPS-tracking audit trail (dev-bridge HTTP, self-cleaning).
   Opens then closes a shift via the real availability endpoint and asserts the
   central AuditLog records the GPS lifecycle: gps.tracking.started on start, and
   gps.tracking.stopped + shift.distance.recomputed on end (alongside shift.*).
   Needs `npm run dev` on :3000. Deletes the exec + its audit rows.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-gps-audit.ts */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
let userId = "", driverId = "";

function post(body: unknown) {
  return fetch(BASE + "/api/driver/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4173", "X-Doodly-Actor": "delivery_executive", "X-Doodly-Actor-Id": userId },
    body: JSON.stringify(body),
  }).then((r) => r.status);
}

async function run() {
  const u = await db.user.create({ data: { name: "GPS-AUDIT-E2E Exec", role: "DELIVERY_EXECUTIVE", email: `gps-audit-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: `GPSA-${stamp}` } });
  driverId = drv.id;

  const onStatus = await post({ available: true, lat: 16.5, lng: 80.6 });
  ok("start shift → 200", onStatus === 200, `status ${onStatus}`);
  const offStatus = await post({ available: false, lat: 16.5, lng: 80.61 });
  ok("end shift → 200", offStatus === 200, `status ${offStatus}`);

  const logs = await db.auditLog.findMany({ where: { userId }, select: { action: true } });
  const actions = new Set(logs.map((l) => l.action));
  ok("audit: gps.tracking.started on shift start", actions.has("gps.tracking.started"), [...actions].join(", "));
  ok("audit: gps.tracking.stopped on shift end", actions.has("gps.tracking.stopped"), [...actions].join(", "));
  ok("audit: shift.distance.recomputed on shift end", actions.has("shift.distance.recomputed"), [...actions].join(", "));
  ok("audit: shift.started + shift.ended still present", actions.has("shift.started") && actions.has("shift.ended"), [...actions].join(", "));
}

async function cleanup() {
  try {
    if (userId) await db.auditLog.deleteMany({ where: { userId } }).catch(() => {});
    if (driverId) {
      await db.shift.deleteMany({ where: { driverId } }).catch(() => {});
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
    console.log(`\n=== GPS audit-trail E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
