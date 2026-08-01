/* COMPREHENSIVE E2E — unit-aware B2B pricing → COGS → P&L (live DB, self-cleaning).
   On a FUTURE day (so only seeded rows are in range): a tanker gives milk inventory;
   a KG milk order (₹72×100) and a Litre milk order (₹78×100) are placed; the day is
   settled (FIFO COGS) and daily/monthly P&L is asserted. Proves the KG sale now DRAWS
   inventory + COGS (the fix), revenue is unit-correct, a price change never mutates a
   past order, and a cancelled order is excluded. Cleans up every seeded row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-b2b-units.ts */
import { PrismaClient } from "@prisma/client";
import { createPricing, updatePricing } from "../lib/b2b/pricing";
import { createOrder } from "../lib/b2b/service";
import { createTanker } from "../lib/milk/tanker";
import { settleDay } from "../lib/milk/settle";
import { reverseByRef } from "../lib/milk/fifo";
import { dailyPnl, monthlyPnl } from "../lib/milk/pnl";
import { saleLitres } from "../lib/b2b/units";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, eps = 2) => Math.abs(a - b) <= eps;   // paise/litre rounding tolerance
const stamp = Date.now();
const actor = { actorRole: "super_admin" };
const DAY = "2027-04-10";                 // future — no real orders/deliveries/consumption here
const YM = DAY.slice(0, 7);
let bizId = "", tankerId = "";
const pricingCodes: string[] = [];
const pricingIds: string[] = [];
const orderIds: string[] = [];

async function run() {
  // inventory: one tanker on DAY (1000 kg @ 6% fat → ~970.87 L on hand)
  const tanker = await createTanker({ procurementDate: DAY, tankerNo: `T-${stamp}`, supplier: "E2E Farm", quantityKg: 1000, fatPct: 6 }, actor);
  tankerId = tanker.id;
  const costPerL = tanker.costPerLitrePaise;

  const biz = await db.business.create({ data: { code: `B2B-U-${stamp}`, name: `B2B Units Full E2E ${stamp}`, type: "RESTAURANT", contactPerson: "T", mobile: "9000000002", line1: "1 St", city: "Vijayawada", state: "AP", pincode: "520010", paymentTerm: "CASH", discountBps: 0, creditLimitPaise: 0, active: true } });
  bizId = biz.id;
  for (const [unit, base] of [["KG", 7200], ["Litres", 7800]] as const) {
    const p = await createPricing({ businessId: bizId, productSlug: "milk", productName: "A2 Buffalo Milk", unit, basePricePaise: base, b2bPricePaise: base, gstBps: 0, minQty: 1 }, actor);
    pricingIds.push(p.id); pricingCodes.push(p.code);
  }

  const oKg = await createOrder({ businessId: bizId, deliveryDate: DAY, deliveryTime: "7 AM", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "KG", unitPricePaise: 1 }] }, actor);
  const oL = await createOrder({ businessId: bizId, deliveryDate: DAY, deliveryTime: "7 AM", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "Litres", unitPricePaise: 1 }] }, actor);
  orderIds.push(oKg.id, oL.id);
  ok("Scenario 1+2 — KG order ₹7,200 + Litre order ₹7,800", oKg.totalPaise === 720000 && oL.totalPaise === 780000, JSON.stringify({ kg: oKg.totalPaise, l: oL.totalPaise }));

  // settle the day → FIFO COGS (KG milk MUST draw inventory now)
  const expectLitres = saleLitres({ productSlug: "milk", unit: "KG", quantity: 100 }, tanker.conversionFactor) + 100;   // 97.09 + 100
  const settle = await settleDay(DAY, actor);
  ok("settle drew KG+Litre litres (~197.09 L — KG no longer dropped)", near(settle.b2b.allocatedLitres, expectLitres, 0.05), `${settle.b2b.allocatedLitres} vs ${expectLitres.toFixed(2)}`);
  // COGS > 0 is the point (the old bug made KG sales draw ZERO cost). Exact rate comes
  // from whichever FIFO lot the shared DB draws first, so we don't pin it to our tanker.
  ok("settle B2B COGS > 0 for the KG+Litre sale (KG drew cost)", settle.b2b.costPaise > 0 && settle.b2b.costPaise === Math.round(settle.b2b.allocatedLitres > 0 ? settle.b2b.costPaise : 0), `${settle.b2b.costPaise} paise (${costPerL} p/L on our lot)`);

  // daily P&L
  const p = await dailyPnl(DAY);
  ok("P&L B2B revenue = ₹15,000 (unit-correct order totals)", p.b2bRevenuePaise === 1500000, `${p.b2bRevenuePaise}`);
  ok("P&L COGS = the settled B2B milk cost (KG included)", p.cogsPaise === settle.b2b.costPaise && p.cogsPaise > 0, `${p.cogsPaise}`);
  ok("P&L gross profit = revenue − COGS", p.grossProfitPaise === p.revenuePaise - p.cogsPaise, JSON.stringify({ rev: p.revenuePaise, cogs: p.cogsPaise, gp: p.grossProfitPaise }));

  // monthly P&L aggregates the same day
  const mp = await monthlyPnl(YM);
  ok("Monthly P&L includes the B2B revenue", mp.b2bRevenuePaise >= 1500000 && mp.cogsPaise >= p.cogsPaise, JSON.stringify({ b2b: mp.b2bRevenuePaise, cogs: mp.cogsPaise }));

  // historical accuracy — change the KG price, old order + past P&L unchanged
  await updatePricing(pricingIds[0], { b2bPricePaise: 8000, basePricePaise: 8000, reason: "revision" }, actor);
  const kgLine = await db.businessOrderItem.findFirst({ where: { orderId: oKg.id, unit: "KG" }, select: { unitPricePaise: true } });
  const p2 = await dailyPnl(DAY);
  ok("historical: past KG order still ₹72 + P&L revenue unchanged after price → ₹80", kgLine?.unitPricePaise === 7200 && p2.b2bRevenuePaise === 1500000, JSON.stringify({ line: kgLine?.unitPricePaise, rev: p2.b2bRevenuePaise }));

  // cancelled order excluded from revenue
  const oCancel = await createOrder({ businessId: bizId, deliveryDate: DAY, deliveryTime: "7 AM", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 10, unit: "Litres", unitPricePaise: 1 }] }, actor);
  orderIds.push(oCancel.id);
  await db.businessOrder.update({ where: { id: oCancel.id }, data: { status: "CANCELLED" } });
  const p3 = await dailyPnl(DAY);
  ok("cancelled order excluded from P&L revenue", p3.b2bRevenuePaise === 1500000, `${p3.b2bRevenuePaise}`);
}

async function cleanup() {
  try {
    // CRITICAL: the settlement drew real FIFO inventory (oldest lot first) — reverse it so
    // real tankers' remainingLitres are restored and the day's consumption rows are removed.
    await db.$transaction(async (tx) => { await reverseByRef(tx, `settle:${DAY}:B2B`); await reverseByRef(tx, `settle:${DAY}:RETAIL`); }).catch(() => {});
    if (tankerId) await db.tankerConsumption.deleteMany({ where: { tankerId } }).catch(() => {});
    if (orderIds.length) {
      await db.businessOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    }
    if (tankerId) await db.milkTanker.deleteMany({ where: { id: tankerId } }).catch(() => {});
    if (pricingIds.length) { await db.businessPricingHistory.deleteMany({ where: { pricingId: { in: pricingIds } } }).catch(() => {}); await db.businessPricing.deleteMany({ where: { id: { in: pricingIds } } }).catch(() => {}); }
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
    // audit rows this test wrote (pricing changes + the day settle)
    for (const c of pricingCodes) await db.auditLog.deleteMany({ where: { target: { startsWith: c } } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { action: "milk.settle", target: { startsWith: DAY } } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Comprehensive B2B units → COGS → P&L E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
