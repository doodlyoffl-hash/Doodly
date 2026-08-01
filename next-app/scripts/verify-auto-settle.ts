/* COMPREHENSIVE E2E — auto-settle COGS on delivery completion (live PROD DB, self-cleaning).
   Proves: completing a retail delivery immediately DRAWS milk inventory + FIFO COGS for its
   IST day (no manual "Settle" needed), that re-completing another stop on the same day
   re-settles idempotently (never double-draws), and that the auto-settle is QUIET (no audit).

   SAFETY on the shared prod DB:
     • the seeded customer is fully opted-OUT (no email/SMS/WhatsApp/push ever leaves) — so the
       real completeDelivery() path runs without any external send (never mail @doodly.test);
     • bottlesOut:0 / bottlesIn:0 → no fleet-stock movement, no bottle/loyalty ledgers;
     • the seed tanker is dated 2020-01-01 so it is the OLDEST open lot → every FIFO draw comes
       from IT, never a real production tanker; cleanup reverses the day + deletes the lot.

   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-auto-settle.ts */
import { PrismaClient } from "@prisma/client";
import { istDayWindow } from "../lib/delivery/stats";
import { dailyPnl } from "../lib/milk/pnl";
import { completeDelivery } from "../lib/delivery/complete";
import { reverseByRef } from "../lib/milk/fifo";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const DAY = "2027-07-15";                                     // future, isolated IST day
const win = istDayWindow(DAY);
const at = (h: number) => new Date(win.start.getTime() + h * 3600_000);
const PRICE = 13000;                                          // ₹130/day (1 × 1000 ml)
const CPL = 5000;                                             // ₹50 / litre (seed tanker)
let userId = "", addrId = "", productId = "", variantId = "", planId = "", subId = "", tankerId = "";
const delIds: string[] = [];

// Σ litres + Σ cost of the RETAIL consumption drawn for DAY (what auto-settle wrote).
async function dayConsumption() {
  const rows = await db.tankerConsumption.findMany({ where: { date: { gte: win.start, lt: win.end }, channel: "RETAIL" }, select: { tankerId: true, litres: true, costPaise: true } });
  return { litres: rows.reduce((s, r) => s + r.litres, 0), cost: rows.reduce((s, r) => s + r.costPaise, 0), allMine: rows.every((r) => r.tankerId === tankerId), n: rows.length };
}

async function run() {
  const u = await db.user.create({ data: { name: `AS-E2E ${stamp}`, role: "CUSTOMER", email: `as-e2e-${stamp}@doodly.test` } });
  userId = u.id;
  // Fully opted-OUT so the real completion path sends NOTHING externally.
  await db.customerPreference.create({ data: { userId, emailOptIn: false, smsOptIn: false, whatsappOptIn: false, pushOptIn: false } });
  addrId = (await db.address.create({ data: { userId, line1: "1 Test St", city: "Vijayawada", pincode: "520010" } })).id;
  productId = (await db.product.create({ data: { slug: `as-milk-${stamp}`, name: "AS Test Milk", description: "E2E auto-settle product" } })).id;
  variantId = (await db.variant.create({ data: { productId, label: "1000 ml", ml: 1000, dailyPaise: PRICE } })).id;
  planId = (await db.plan.create({ data: { slug: `as-p30-${stamp}`, name: "AS 30-Day", days: 30, discountBps: 0 } })).id;
  subId = (await db.subscription.create({ data: { userId, planId, addressId: addrId, startDate: new Date(), status: "ACTIVE", items: { create: [{ variantId, qty: 1 }] } } })).id;
  // Oldest open lot (2020) with ample stock @ ₹50/L → all test draws stay inside it.
  tankerId = (await db.milkTanker.create({ data: {
    code: `TNK-ASE2E-${stamp}`, procurementDate: new Date("2020-01-01T00:00:00Z"), tankerNo: `E2E-${stamp}`, supplier: "E2E Supplier",
    quantityKg: 103, fatPct: 6, conversionFactor: 1.03, milkRatePaise: CPL, fatRatePaise: 0,
    litres: 100, kgFat: 6.18, milkCostPaise: 500000, fatCostPaise: 0, transportPaise: 0,
    totalCostPaise: 500000, costPerLitrePaise: CPL, costPerKgPaise: 4854, consumedLitres: 0, remainingLitres: 100, status: "OPEN",
  } })).id;

  const mkStop = () => db.delivery.create({ data: { subscriptionId: subId, date: at(6), status: "SCHEDULED", kind: "DELIVERY", bottleCount: 1 }, select: { id: true } });
  const remaining = async () => (await db.milkTanker.findUnique({ where: { id: tankerId }, select: { remainingLitres: true } }))!.remainingLitres;

  // A1 — before any completion the day has no COGS drawn
  const p0 = await dailyPnl(DAY);
  ok("A1: day starts with ₹0 COGS + full tanker (100 L)", p0.cogsPaise === 0 && (await remaining()) === 100, `cogs=${p0.cogsPaise} rem=${await remaining()}`);

  // A2–A6 — complete ONE stop → auto-settle draws 1 L FIFO COGS immediately (no manual settle)
  const d1 = await mkStop(); delIds.push(d1.id);
  const c1 = await completeDelivery(d1.id, { bottlesOut: 0, bottlesIn: 0 });
  ok("A2: completeDelivery → DELIVERED (not idempotent)", c1 !== null && !("idempotent" in c1 && c1.idempotent) && c1!.delivery.status === "DELIVERED");
  const d1row = await db.delivery.findUnique({ where: { id: d1.id }, select: { revenuePaise: true } });
  ok("A3: revenue frozen on the row = ₹130", d1row?.revenuePaise === PRICE, String(d1row?.revenuePaise));
  const dc1 = await dayConsumption();
  ok("A4: auto-settle drew 1 L COGS = ₹50, all from the seed lot", dc1.litres === 1 && dc1.cost === CPL && dc1.allMine, JSON.stringify(dc1));
  const p1 = await dailyPnl(DAY);
  ok("A5: dailyPnl shows COGS ₹50 + revenue ₹130 WITHOUT a manual settle", p1.cogsPaise === CPL && p1.retailRevenuePaise === PRICE, JSON.stringify({ cogs: p1.cogsPaise, rev: p1.retailRevenuePaise }));
  ok("A6: tanker drawn down to 99 L", (await remaining()) === 99, String(await remaining()));

  // A7 — the auto-settle is QUIET: no milk.settle audit row for the day
  ok("A7: auto-settle wrote NO milk.settle audit (quiet)", (await db.auditLog.count({ where: { action: "milk.settle", target: { startsWith: DAY } } })) === 0);

  // A8–A10 — complete a SECOND stop same day → re-settle is idempotent (2 L total, not 3)
  const d2 = await mkStop(); delIds.push(d2.id);
  await completeDelivery(d2.id, { bottlesOut: 0, bottlesIn: 0 });
  const dc2 = await dayConsumption();
  ok("A8: idempotent re-settle → 2 L / ₹100 total (not double-drawn)", dc2.litres === 2 && dc2.cost === 2 * CPL && dc2.allMine, JSON.stringify(dc2));
  ok("A9: tanker at 98 L (reverse+redo, no over-draw)", (await remaining()) === 98, String(await remaining()));
  const p2 = await dailyPnl(DAY);
  ok("A10: dailyPnl COGS ₹100 + revenue ₹260 (2 delivered)", p2.cogsPaise === 2 * CPL && p2.retailRevenuePaise === 2 * PRICE, JSON.stringify({ cogs: p2.cogsPaise, rev: p2.retailRevenuePaise }));

  // A11 — re-completing an already-delivered stop is a no-op (idempotent), COGS unchanged
  const again = await completeDelivery(d1.id, { bottlesOut: 0, bottlesIn: 0 });
  const p3 = await dailyPnl(DAY);
  ok("A11: re-complete = idempotent, COGS still ₹100", again !== null && "idempotent" in again! && again!.idempotent === true && p3.cogsPaise === 2 * CPL, JSON.stringify({ idem: again && "idempotent" in again && again.idempotent, cogs: p3.cogsPaise }));
}

async function cleanup() {
  try {
    // Reverse the day's draws (restores whatever lots were touched — belt & suspenders) then purge.
    await db.$transaction(async (tx) => { await reverseByRef(tx, `settle:${DAY}:RETAIL`); await reverseByRef(tx, `settle:${DAY}:B2B`); }).catch(() => {});
    const allDel = [...delIds];
    if (subId) { (await db.delivery.findMany({ where: { subscriptionId: subId }, select: { id: true } })).forEach((d) => allDel.push(d.id)); }
    for (const id of allDel) await db.auditLog.deleteMany({ where: { action: "revenue.recognized", target: { startsWith: id } } }).catch(() => {});
    if (allDel.length) {
      await db.bottleLedger.deleteMany({ where: { deliveryId: { in: allDel } } }).catch(() => {});
      await db.delivery.deleteMany({ where: { id: { in: allDel } } }).catch(() => {});
    }
    if (tankerId) { await db.tankerConsumption.deleteMany({ where: { tankerId } }).catch(() => {}); await db.milkTanker.deleteMany({ where: { id: tankerId } }).catch(() => {}); }
    if (subId) { await db.subscriptionEvent.deleteMany({ where: { subscriptionId: subId } }).catch(() => {}); await db.subscriptionItem.deleteMany({ where: { subscriptionId: subId } }).catch(() => {}); await db.subscription.deleteMany({ where: { id: subId } }).catch(() => {}); }
    if (planId) await db.plan.deleteMany({ where: { id: planId } }).catch(() => {});
    if (variantId) await db.variant.deleteMany({ where: { id: variantId } }).catch(() => {});
    if (productId) await db.product.deleteMany({ where: { id: productId } }).catch(() => {});
    if (userId) await db.notification.deleteMany({ where: { userId } }).catch(() => {});
    if (addrId) await db.address.deleteMany({ where: { id: addrId } }).catch(() => {});
    if (userId) { await db.customerPreference.deleteMany({ where: { userId } }).catch(() => {}); await db.user.deleteMany({ where: { id: userId } }).catch(() => {}); }
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Auto-settle COGS on completion E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
