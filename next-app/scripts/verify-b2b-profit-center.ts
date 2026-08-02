/* COMPREHENSIVE E2E — Unified Profit Centre: B2B ↔ delivery-based accounting (live PROD DB).
   Proves the integration end-to-end on an ISOLATED future day (no real data), self-cleaning:
     S1 retail delivery  → retail revenue recognised in the P&L (frozen per delivery)
     S2 B2B delivered    → NET-of-GST revenue frozen on the order + settleDay draws B2B COGS
     S3 same-day combined→ retailRevenue + b2bRevenue == totalRevenue (one Profit Centre)
     S5 pending B2B      → books ZERO revenue (revenue only after successful delivery)
     S4 delivered→cancel → immutable adjustment; frozen row + delivered-day P&L UNCHANGED
                           (Step 11 historical integrity); reversal lands on the cancel day
     REPORT reconciliation: b2bSalesReport COGS == P&L COGS (single FIFO ledger, Step 10)
     METRICS: b2bDeliveries / b2bBusinessesServed / retailCustomersServed populated
     INVARIANTS: revenue − COGS − expenses == net ; retail + b2b == total
   Recognition stamps deliveredAt = now; to assert on a clean day we move it to the future test
   day and re-settle (today is restored). Everything seeded is deleted; inventory is reversed.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-b2b-profit-center.ts */
import { PrismaClient } from "@prisma/client";
import { updateOrderStatus, cancelOrder } from "../lib/b2b/service";
import { b2bNetRevenuePaise } from "../lib/b2b/recognition";
import { dailyPnl } from "../lib/milk/pnl";
import { settleDay, b2bLitresForDay } from "../lib/milk/settle";
import { b2bSalesReport } from "../lib/b2b/sales-report";
import { istDayWindow, istISO } from "../lib/delivery/stats";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, eps = 2) => Math.abs(a - b) <= eps;
const stamp = Date.now();
const DAY = 86400000;

const testIso = new Date(stamp + 400 * DAY).toISOString().slice(0, 10);   // isolated future day
const adjIso = new Date(stamp + 420 * DAY).toISOString().slice(0, 10);     // isolated day for the adjustment effect
const win = istDayWindow(testIso);
const todayIso = istISO(new Date());

let userId = "", bizId = "", tankerId = "", deliveryId = "", orderId = "";

async function run() {
  // ---- seed (isolated future day) ----
  userId = (await db.user.create({ data: { name: `PCU ${stamp}`, role: "CUSTOMER", email: `pcu-${stamp}@doodly.test` } })).id;
  bizId = (await db.business.create({ data: { code: `PCB-${stamp}`, name: `PC Biz ${stamp}`, type: "SWEET_SHOP", contactPerson: "Test", mobile: `9${String(stamp).slice(-9)}`, line1: "1 Test Rd", pincode: "520001", paymentTerm: "CASH" } })).id;
  // guarantee ≥20 L inventory so the B2B draw never short-falls (newest lot → real oldest lots draw first)
  tankerId = (await db.milkTanker.create({ data: { code: `PCT-${stamp}`, procurementDate: win.start, tankerNo: "T-TEST", supplier: "TEST", quantityKg: 103, fatPct: 6, conversionFactor: 1.03, milkRatePaise: 0, fatRatePaise: 0, litres: 100, kgFat: 6.18, milkCostPaise: 500000, fatCostPaise: 0, transportPaise: 0, totalCostPaise: 500000, costPerLitrePaise: 5000, costPerKgPaise: 4854, remainingLitres: 100, consumedLitres: 0, status: "OPEN" } })).id;
  // S1 retail: a completed delivery on the test day with a frozen ₹500 revenue
  deliveryId = (await db.delivery.create({ data: { userId, date: win.start, kind: "DELIVERY", status: "DELIVERED", revenuePaise: 50000, bottleCount: 0 } })).id;
  // B2B order (PENDING): 20 L milk @ ₹66/L = ₹1320 + ₹66 GST = ₹1386. Net revenue = ₹1320.
  orderId = (await db.businessOrder.create({
    data: {
      code: `PCO-${stamp}`, businessId: bizId, deliveryDate: win.start, deliveryTime: "6 AM",
      subtotalPaise: 132000, discountPaise: 0, taxPaise: 6600, totalPaise: 138600, paymentTerm: "CASH", status: "PENDING",
      items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 20, unit: "Litres", unitPricePaise: 6600, lineTotalPaise: 132000 }] },
    },
  })).id;

  // ---- S5 / S1: pending B2B books nothing; retail already recognised ----
  const p0 = await dailyPnl(testIso);
  ok("S5: pending B2B order books ZERO revenue", p0.b2bRevenuePaise === 0, `b2b=${p0.b2bRevenuePaise}`);
  ok("S1: retail delivery recognised in P&L (₹500)", p0.retailRevenuePaise === 50000 && p0.retailCustomersServed === 1, `retail=${p0.retailRevenuePaise} cust=${p0.retailCustomersServed}`);

  // ---- S2: mark DELIVERED → freeze net revenue + settle COGS ----
  await updateOrderStatus({ id: orderId, status: "CONFIRMED", actorRole: "admin" });
  await updateOrderStatus({ id: orderId, status: "PREPARING", actorRole: "admin" });
  await updateOrderStatus({ id: orderId, status: "OUT_FOR_DELIVERY", actorRole: "admin" });
  await updateOrderStatus({ id: orderId, status: "DELIVERED", actorRole: "admin", actorId: "adminA" });
  const afterDeliver = await db.businessOrder.findUnique({ where: { id: orderId }, select: { revenuePaise: true, deliveredAt: true } });
  ok("S2: revenue frozen NET of GST (₹1386 − ₹66 = ₹1320)", afterDeliver?.revenuePaise === 132000 && afterDeliver.revenuePaise === b2bNetRevenuePaise({ totalPaise: 138600, taxPaise: 6600 }), `rev=${afterDeliver?.revenuePaise}`);
  ok("S2: deliveredAt stamped", !!afterDeliver?.deliveredAt);
  // idempotent re-flip must not move the frozen figure
  await updateOrderStatus({ id: orderId, status: "DELIVERED", actorRole: "admin" }).catch(() => {});
  const reflip = await db.businessOrder.findUnique({ where: { id: orderId }, select: { revenuePaise: true } });
  ok("S2: recognition idempotent (re-flip keeps ₹1320)", reflip?.revenuePaise === 132000);

  // recognition stamped deliveredAt = now; move it onto the isolated test day + settle there
  await db.businessOrder.update({ where: { id: orderId }, data: { deliveredAt: win.start } });
  await settleDay(todayIso, { actorRole: "system", quiet: true });   // remove my draw from today
  await settleDay(testIso, { actorRole: "system", quiet: true });    // draw my COGS on the test day

  const p1 = await dailyPnl(testIso);
  ok("S2: B2B revenue recognised on delivery (₹1320)", p1.b2bRevenuePaise === 132000, `b2b=${p1.b2bRevenuePaise}`);
  ok("S2: B2B COGS drew from inventory (>0)", p1.cogsPaise > 0, `cogs=${p1.cogsPaise}`);
  ok("S2: B2B litres delivered == 20 L", near(await b2bLitresForDay(win.start, win.end), 20, 0.01));
  const consumed = await db.tankerConsumption.aggregate({ where: { channel: "B2B", date: { gte: win.start, lt: win.end } }, _sum: { litres: true, costPaise: true } });
  ok("S2: B2B inventory ledger row (20 L, cost>0)", near(consumed._sum.litres ?? 0, 20, 0.01) && (consumed._sum.costPaise ?? 0) > 0, `L=${consumed._sum.litres} ₹=${consumed._sum.costPaise}`);

  // ---- S3: combined identity ----
  ok("S3: retail + B2B == total revenue (₹500 + ₹1320 = ₹1820)", p1.retailRevenuePaise + p1.b2bRevenuePaise === p1.revenuePaise && p1.revenuePaise === 182000, `${p1.retailRevenuePaise}+${p1.b2bRevenuePaise}=${p1.revenuePaise}`);
  ok("S3: B2B metrics populated (1 delivery · 1 business)", p1.b2bDeliveries === 1 && p1.b2bBusinessesServed === 1, `del=${p1.b2bDeliveries} biz=${p1.b2bBusinessesServed}`);
  ok("INV: revenue − COGS − expenses == net", p1.revenuePaise - p1.cogsPaise - p1.expensesPaise === p1.netProfitPaise && p1.grossProfitPaise === p1.revenuePaise - p1.cogsPaise);

  // ---- REPORT reconciliation (single FIFO ledger) ----
  const rep = await b2bSalesReport(testIso, testIso);
  ok("STEP10: B2B sales-report COGS == P&L B2B COGS (one ledger)", rep.analytics.cogsPaise === p1.cogsPaise, `report=${rep.analytics.cogsPaise} pnl=${p1.cogsPaise}`);
  ok("STEP10: B2B sales-report revenue == ₹1320 (delivered)", rep.analytics.revenuePaise === 132000, `rep=${rep.analytics.revenuePaise}`);

  // ---- S4: cancel a delivered order → adjustment, history intact ----
  await cancelOrder({ id: orderId, actorId: "adminA", actorRole: "admin" });
  const adj = await db.businessRevenueAdjustment.findFirst({ where: { businessOrderId: orderId }, select: { type: true, amountPaise: true } });
  const frozen = await db.businessOrder.findUnique({ where: { id: orderId }, select: { revenuePaise: true, status: true } });
  ok("S4: cancellation created an adjustment (₹1320 CANCELLATION)", adj?.type === "CANCELLATION" && adj.amountPaise === 132000);
  ok("S4: frozen revenue NOT edited (immutable ₹1320)", frozen?.revenuePaise === 132000 && frozen.status === "CANCELLED");
  const p2 = await dailyPnl(testIso);
  ok("S4/STEP11: delivered-day P&L UNCHANGED (revenue ₹1320, COGS stands)", p2.b2bRevenuePaise === 132000 && p2.cogsPaise === p1.cogsPaise, `b2b=${p2.b2bRevenuePaise} cogs=${p2.cogsPaise}`);
  // the reversal lands on the cancellation day — move it to an isolated day to assert its effect
  await db.businessRevenueAdjustment.updateMany({ where: { businessOrderId: orderId }, data: { effectiveOn: istDayWindow(adjIso).start } });
  const pAdj = await dailyPnl(adjIso);
  ok("S4: reversal books −₹1320 on the cancellation day", pAdj.b2bRevenuePaise === -132000, `b2b=${pAdj.b2bRevenuePaise}`);
}

async function cleanup() {
  try {
    if (orderId) { await db.businessOrder.delete({ where: { id: orderId } }).catch(() => {}); }   // cascades items/events/adjustments
    if (deliveryId) await db.delivery.deleteMany({ where: { id: deliveryId } }).catch(() => {});
    // reverse the test day's draws (order gone → 0 litres) so all tankers are restored, then today
    await settleDay(testIso, { actorRole: "system", quiet: true }).catch(() => {});
    await settleDay(todayIso, { actorRole: "system", quiet: true }).catch(() => {});
    await db.tankerConsumption.deleteMany({ where: { tankerId } }).catch(() => {});
    if (tankerId) await db.milkTanker.deleteMany({ where: { id: tankerId } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { OR: [{ target: { contains: orderId } }, { target: { contains: bizId } }] } }).catch(() => {});
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== B2B ↔ Profit Centre E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
