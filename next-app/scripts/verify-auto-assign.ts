/* E2E — automated delivery assignment (live PROD DB, self-cleaning).
   T1 (assignment works): a delivery day with 3 unassigned SCHEDULED deliveries + one AVAILABLE
     executive → runScheduledAutoAssignment assigns all 3 (ASSIGNED + deliveryAssignment + trip).
   T2 (A1 guard, no deadlock): with the executive OFFLINE, a second day's deliveries are NOT
     queued — they stay SCHEDULED (assignable by the next sweep) + admins are alerted.
   SAFE: a unique slot label so the admin alert + exec notification are cleanable; every row deleted.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-auto-assign.ts */
import { PrismaClient } from "@prisma/client";
import { runScheduledAutoAssignment } from "../lib/assignment/service";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const SLOT = `AA-E2E-${stamp}`;
const IST = 5.5 * 3600e3;
const istMid = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) - IST); };
const DAY1 = "2027-09-15", DAY2 = "2027-09-16";
let userId = "", driverId = "", addrId = "";
const del1: string[] = [], del2: string[] = [];

async function run() {
  const u = await db.user.create({ data: { name: `AA-Exec ${stamp}`, role: "DELIVERY_EXECUTIVE", email: `aa-exec-${stamp}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, active: true } });
  driverId = drv.id;
  await db.executiveStatus.create({ data: { driverId: drv.id, availability: "AVAILABLE", assignedBottles: 0 } });
  addrId = (await db.address.create({ data: { userId: u.id, line1: "1 Test St", city: "Vijayawada", pincode: "520010" } })).id;

  const mkDel = (day: string) => db.delivery.create({ data: { date: istMid(day), slot: SLOT, status: "SCHEDULED", kind: "DELIVERY", bottleCount: 1, addressId: addrId }, select: { id: true } });

  // T1 — available exec → assigned
  for (let i = 0; i < 3; i++) del1.push((await mkDel(DAY1)).id);
  const r1 = await runScheduledAutoAssignment({ actorRole: "system" }, DAY1);
  const assigned = await db.delivery.count({ where: { id: { in: del1 }, status: "ASSIGNED", driverId } });
  const daRows = await db.deliveryAssignment.count({ where: { deliveryId: { in: del1 } } });
  const trips = await db.tripHistory.count({ where: { driverId } });
  ok("T1: 3 deliveries assigned to the available exec", r1.assigned === 3 && assigned === 3 && daRows === 3 && trips >= 1, JSON.stringify({ swept: r1.assigned, assigned, daRows, trips }));
  const queued1 = await db.assignmentQueue.count({ where: { deliveryId: { in: del1 } } });
  ok("T1: none queued", queued1 === 0);

  // T2 — exec OFFLINE → NOT queued, stays SCHEDULED (A1 guard), admins alerted
  await db.executiveStatus.update({ where: { driverId }, data: { availability: "OFFLINE", currentTripId: null, assignedBottles: 0 } });
  for (let i = 0; i < 2; i++) del2.push((await mkDel(DAY2)).id);
  const r2 = await runScheduledAutoAssignment({ actorRole: "system" }, DAY2);
  const stillSched = await db.delivery.count({ where: { id: { in: del2 }, status: "SCHEDULED", driverId: null } });
  const queued2 = await db.assignmentQueue.count({ where: { deliveryId: { in: del2 } } });
  ok("T2: 0 available → deliveries NOT queued, stay SCHEDULED", r2.assigned === 0 && stillSched === 2 && queued2 === 0, JSON.stringify({ assigned: r2.assigned, stillSched, queued2 }));
  const alerted = await db.notification.count({ where: { title: "No executives available", body: { contains: SLOT } } });
  ok("T2: admins alerted (no-executives)", alerted >= 1, `notifs=${alerted}`);
}

async function cleanup() {
  try {
    const allDel = [...del1, ...del2];
    if (allDel.length) {
      await db.assignmentLog.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
      await db.deliveryAssignment.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
      await db.assignmentQueue.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
    }
    if (driverId) {
      await db.assignmentLog.deleteMany({ where: { driverId } }).catch(() => {});
      await db.tripHistory.deleteMany({ where: { driverId } }).catch(() => {});
    }
    if (allDel.length) await db.delivery.deleteMany({ where: { id: { in: allDel } } }).catch(() => {});
    // notifications: exec NEW_TRIP (to our user) + admin NO_EXECUTIVES (identifiable by our unique slot)
    if (userId) await db.notification.deleteMany({ where: { userId } }).catch(() => {});
    await db.notification.deleteMany({ where: { body: { contains: SLOT } } }).catch(() => {});
    if (driverId) { await db.executiveStatus.deleteMany({ where: { driverId } }).catch(() => {}); await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {}); }
    if (addrId) await db.address.deleteMany({ where: { id: addrId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Auto-assignment E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
