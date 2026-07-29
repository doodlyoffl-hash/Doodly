/* E2E for the Bottle Return Lifecycle engine (live DB, self-cleaning). Drives the spec's
   Day1/2/3 timeline through the REAL completeDelivery() path and asserts the rolled-forward
   held balance, partial carry-forward, skip = no-op, fleet inventory auto-move, idempotency,
   and the cancel→recovery workflow. Restores fleet stock + deletes every test row (incl.
   loyalty/notification side-effects) so nothing is left behind.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-bottle-lifecycle.ts */
import { PrismaClient } from "@prisma/client";
import { completeDelivery } from "../lib/delivery/complete";
import { customerHeld } from "../lib/bottles/balance";
import { openRecovery, closeRecovery } from "../lib/bottles/recovery";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const held = async (uid: string) => (await customerHeld(uid)).held;

let userId = "", addrId = "", subId = "";
const delIds: string[] = [];
let stockSnap: { id: string; qty: number }[] = [];
const TAG = "BOTTLE-E2E";

async function mkDelivery(date: Date, bottleCount: number) {
  const d = await db.delivery.create({ data: { subscriptionId: subId, date, status: "SCHEDULED", bottleCount } });
  delIds.push(d.id); return d.id;
}
const inStage = async (stage: string) => (await db.bottleStock.findUnique({ where: { capacityMl_stage: { capacityMl: 1000, stage: stage as never } } }))?.qty ?? 0;

async function run() {
  stockSnap = (await db.bottleStock.findMany({ select: { id: true, qty: true } }));
  const inCircBefore = await inStage("IN_CIRCULATION"), cleanBefore = await inStage("CLEANING");

  const u = await db.user.create({ data: { name: `${TAG} Customer`, role: "CUSTOMER", email: `bottle-e2e-${Date.now()}@doodly.test` } });
  userId = u.id;
  const addr = await db.address.create({ data: { userId, line1: `${TAG}`, city: "Vijayawada", state: "Andhra Pradesh", pincode: "520010" } });
  addrId = addr.id;
  const plan = await db.plan.findFirst({ select: { id: true } });
  if (!plan) { ok("a plan exists", false, "no Plan rows"); return; }
  const sub = await db.subscription.create({ data: { userId, planId: plan.id, addressId: addrId, startDate: new Date(), status: "ACTIVE" } });
  subId = sub.id;

  // ---- S1: no bottle expected before the first delivery ----
  ok("S1 before any delivery: held = 0", (await held(userId)) === 0);

  // Day 1 — deliver 1, collect 0 → held 1
  const day = (n: number) => new Date(Date.UTC(2027, 3, n));
  const d1 = await mkDelivery(day(1), 1);
  await completeDelivery(d1, { bottlesIn: 0 });
  ok("S1 after 1st delivery: held = 1 (expected next return)", (await held(userId)) === 1, `held=${await held(userId)}`);

  // idempotency — re-complete must not double-count
  await completeDelivery(d1, { bottlesIn: 0 });
  ok("Idempotent re-complete: held still 1", (await held(userId)) === 1);

  // Day 2 — before held 1; collect 1 + deliver 1 → held 1
  const d2 = await mkDelivery(day(2), 1);
  ok("S2 before 2nd delivery: held = 1", (await held(userId)) === 1);
  await completeDelivery(d2, { bottlesIn: 1, bottlesOut: 1 });
  ok("S2 after collect 1 + deliver 1: held = 1", (await held(userId)) === 1, `held=${await held(userId)}`);

  // Day 3 partial — before held 1; deliver 2, collect only 1 → held carries forward to 2
  const d3 = await mkDelivery(day(3), 2);
  await completeDelivery(d3, { bottlesIn: 1, bottlesOut: 2 });
  ok("S3 partial (deliver 2, return 1): held rolls forward to 2", (await held(userId)) === 2, `held=${await held(userId)}`);

  // Day 4 skip — a skipped stop must not touch the balance
  const d4 = await mkDelivery(day(4), 1);
  await db.delivery.update({ where: { id: d4 }, data: { status: "SKIPPED" } });
  ok("S4 skipped delivery leaves held unchanged (= 2)", (await held(userId)) === 2, `held=${await held(userId)}`);

  // ---- Inventory auto-move: 4 handed over (AVAILABLE→IN_CIRCULATION), 2 collected
  //      (IN_CIRCULATION→CLEANING) → net IN_CIRCULATION = out−in = 2, CLEANING = in = 2 ----
  const inCircAfter = await inStage("IN_CIRCULATION"), cleanAfter = await inStage("CLEANING");
  ok("Inventory: net IN_CIRCULATION = handovers − collected (4−2 = 2)", inCircAfter - inCircBefore === 2, `Δ=${inCircAfter - inCircBefore}`);
  ok("Inventory: CLEANING grew by empties collected (2)", cleanAfter - cleanBefore === 2, `Δ=${cleanAfter - cleanBefore}`);

  // ---- Ledger rows written by completeDelivery ----
  const rows = await db.bottleLedger.groupBy({ by: ["event"], where: { userId }, _sum: { qty: true } });
  const q = (e: string) => rows.find((r) => r.event === e)?._sum.qty ?? 0;
  ok("Ledger: ISSUED = 4, RETURNED = 2", q("ISSUED") === 4 && q("RETURNED") === 2, `ISSUED=${q("ISSUED")} RETURNED=${q("RETURNED")}`);

  // ---- S5: recovery on cancel with outstanding bottles ----
  const rec = await openRecovery(userId, subId);
  ok("S5 openRecovery creates an OPEN case for the 2 held bottles", !!rec && rec.outstandingQty === 2, JSON.stringify(rec));
  const dup = await openRecovery(userId, subId);
  ok("S5 openRecovery is idempotent (same case)", !!dup && !!rec && dup.id === rec.id);
  await closeRecovery(rec!.id, "RECOVERED", { actorRole: "admin" });
  ok("S5 closeRecovery RECOVERED zeroes the held balance", (await held(userId)) === 0, `held=${await held(userId)}`);
  const recRow = await db.bottleRecovery.findUnique({ where: { id: rec!.id }, select: { status: true } });
  ok("S5 recovery marked RECOVERED + closed", recRow?.status === "RECOVERED");
}

async function cleanup() {
  try {
    if (delIds.length) await db.bottleMovement.deleteMany({ where: { note: { in: delIds.map((id) => `delivery ${id}`) } } });
    for (const s of stockSnap) await db.bottleStock.update({ where: { id: s.id }, data: { qty: s.qty } }).catch(() => {});
    if (userId) {
      await db.loyaltyLedger.deleteMany({ where: { userId } }).catch(() => {});
      await db.notification.deleteMany({ where: { userId } }).catch(() => {});
      await db.bottleRecovery.deleteMany({ where: { userId } });
      await db.bottleLedger.deleteMany({ where: { userId } });
    }
    if (subId) { await db.subscriptionEvent.deleteMany({ where: { subscriptionId: subId } }).catch(() => {}); }
    if (delIds.length) await db.delivery.deleteMany({ where: { id: { in: delIds } } });
    if (subId) await db.subscription.deleteMany({ where: { id: subId } });
    if (addrId) await db.address.deleteMany({ where: { id: addrId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Bottle Lifecycle E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
