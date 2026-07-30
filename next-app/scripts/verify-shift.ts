/* E2E for the delivery-executive Shift lifecycle (live DB, self-cleaning).
   openShift (idempotent) → deliveries within the window → closeShift stamps
   worked-minutes + totals (deliveries / distance / bottles), excludes non-delivered
   stops and deliveries outside the window. Cleans up every seeded row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-shift.ts */
import { PrismaClient } from "@prisma/client";
import { openShift, closeShift, currentShift, shiftTotals } from "../lib/delivery/shift";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const TAG = "SHIFT-E2E";
let userId = "", driverId = "";
const delIds: string[] = [];

async function run() {
  const u = await db.user.create({ data: { name: `${TAG} Exec`, role: "DELIVERY_EXECUTIVE", email: `shift-e2e-${Date.now()}@doodly.test` } });
  userId = u.id;
  const drv = await db.driver.create({ data: { userId: u.id, employeeId: `SFT-${Date.now()}` } });
  driverId = drv.id;

  // open (idempotent)
  const s1 = await openShift(driverId);
  ok("openShift creates an OPEN shift", s1.status === "OPEN" && !!s1.startedAt, JSON.stringify({ id: s1.id, status: s1.status }));
  const s2 = await openShift(driverId);
  ok("openShift is idempotent (reuses the open shift)", s2.id === s1.id);
  ok("currentShift returns the open shift", (await currentShift(driverId))?.id === s1.id);

  // deliveries INSIDE the window (delivered) + one non-delivered (excluded)
  const mk = async (status: string, legKm: number, out: number, inn: number) => {
    const d = await db.delivery.create({ data: { driverId, date: new Date(), status: status as never, deliveredAt: status === "DELIVERED" ? new Date() : null, legDistanceKm: legKm, bottlesOut: out, bottlesIn: inn } });
    delIds.push(d.id); return d;
  };
  await mk("DELIVERED", 3, 2, 1);
  await mk("DELIVERED", 2, 1, 2);
  await mk("SCHEDULED", 9, 9, 9);   // not delivered → must be excluded

  const t = await shiftTotals(driverId, s1.startedAt, new Date());
  ok("shiftTotals counts only delivered stops (2)", t.deliveriesCount === 2, JSON.stringify(t));
  ok("shiftTotals sums distance (5 km), delivered (3), collected (3)", t.distanceKm === 5 && t.bottlesDelivered === 3 && t.bottlesCollected === 3, JSON.stringify(t));

  // close → stamps totals
  const closed = await closeShift(driverId);
  ok("closeShift → CLOSED with endedAt + workedMinutes", !!closed && closed.status === "CLOSED" && !!closed.endedAt && closed.workedMinutes != null, JSON.stringify(closed && { status: closed.status, wm: closed.workedMinutes }));
  ok("closed shift carries the totals", !!closed && closed.deliveriesCount === 2 && closed.distanceKm === 5 && closed.bottlesDelivered === 3 && closed.bottlesCollected === 3, JSON.stringify(closed && { d: closed.deliveriesCount, km: closed.distanceKm, bd: closed.bottlesDelivered, bc: closed.bottlesCollected }));
  ok("closeShift again → null (nothing open)", (await closeShift(driverId)) === null);
  ok("currentShift is null after close", (await currentShift(driverId)) === null);
}

async function cleanup() {
  try {
    await db.shift.deleteMany({ where: { driverId } }).catch(() => {});
    if (delIds.length) await db.delivery.deleteMany({ where: { id: { in: delIds } } }).catch(() => {});
    if (driverId) await db.driver.deleteMany({ where: { id: driverId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Shift lifecycle E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
