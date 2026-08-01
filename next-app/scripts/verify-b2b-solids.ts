/* E2E for solids COGS via milk-equivalent yields (live DB, self-cleaning).
   Enables the config (paneer 5 L/kg), sells 10 KG paneer, settles → asserts it draws
   10×5 = 50 L of milk inventory + FIFO COGS and the sales report shows paneer profit;
   then disables → the same sale draws ZERO (revenue-only). Pins + restores the config,
   reverses the FIFO draw, cleans up every seeded row.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-b2b-solids.ts */
import { PrismaClient } from "@prisma/client";
import { createPricing } from "../lib/b2b/pricing";
import { createOrder } from "../lib/b2b/service";
import { createTanker } from "../lib/milk/tanker";
import { settleDay } from "../lib/milk/settle";
import { reverseByRef } from "../lib/milk/fifo";
import { milkDrawLitres } from "../lib/b2b/units";
import { b2bSalesReport } from "../lib/b2b/sales-report";
import { SOLIDS_COGS_KEY, patchSolidsCogsConfig } from "../lib/b2b/solids-config";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const near = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;
const stamp = Date.now();
const actor = { actorRole: "super_admin" };
const DAY = "2027-05-20";
let bizId = "", tankerId = "", hadCfg = false;
let priorCfg: unknown;
const pricingIds: string[] = [];
const orderIds: string[] = [];
const YIELDS = { paneer: 5, ghee: 22, kova: 5.5, curd: 1 };

async function run() {
  const row = await db.appSetting.findUnique({ where: { key: SOLIDS_COGS_KEY } }).catch(() => null);
  hadCfg = !!row; priorCfg = row?.value;
  await patchSolidsCogsConfig({ enabled: true, yields: YIELDS });

  // pure converter
  ok("milkDrawLitres: paneer 10 KG @5 → 50 L", near(milkDrawLitres({ productSlug: "paneer", unit: "KG", quantity: 10 }, { conversionFactor: 1.03, solidYields: YIELDS }), 50));
  ok("milkDrawLitres: paneer 10 Packs → 0 (non-weight unit)", milkDrawLitres({ productSlug: "paneer", unit: "Packs", quantity: 10 }, { conversionFactor: 1.03, solidYields: YIELDS }) === 0);
  ok("milkDrawLitres: paneer 10 KG, yields off → 0", milkDrawLitres({ productSlug: "paneer", unit: "KG", quantity: 10 }, { conversionFactor: 1.03, solidYields: null }) === 0);

  const tanker = await createTanker({ procurementDate: DAY, tankerNo: `TS-${stamp}`, supplier: "E2E", quantityKg: 1000, fatPct: 6 }, actor);
  tankerId = tanker.id;
  const biz = await db.business.create({ data: { code: `B2B-SOL-${stamp}`, name: `Solids E2E ${stamp}`, type: "SWEET_SHOP", contactPerson: "T", mobile: "9000000003", line1: "1 St", city: "Vijayawada", state: "AP", pincode: "520010", paymentTerm: "CASH", discountBps: 0, creditLimitPaise: 0, active: true } });
  bizId = biz.id;
  const p = await createPricing({ businessId: bizId, productSlug: "paneer", productName: "Malai Paneer", unit: "KG", basePricePaise: 40000, b2bPricePaise: 40000, gstBps: 0, minQty: 1 }, actor);
  pricingIds.push(p.id);
  const o = await createOrder({ businessId: bizId, deliveryDate: DAY, deliveryTime: "7 AM", items: [{ productSlug: "paneer", productName: "Malai Paneer", quantity: 10, unit: "KG", unitPricePaise: 1 }] }, actor);
  orderIds.push(o.id);
  ok("paneer order billed ₹400/kg × 10 = ₹4,000", o.totalPaise === 400000, `${o.totalPaise}`);

  // settle with solids ENABLED → paneer draws 50 L + COGS
  const s1 = await settleDay(DAY, actor);
  ok("solids ENABLED: paneer 10 KG drew ~50 L of milk inventory", near(s1.b2b.allocatedLitres, 50), `${s1.b2b.allocatedLitres}`);
  ok("solids ENABLED: paneer sale carries COGS > 0", s1.b2b.costPaise > 0, `${s1.b2b.costPaise}`);

  const rep = await b2bSalesReport(DAY, DAY);
  const pr = rep.data.find((x) => x.productSlug === "paneer" && x.unit === "KG");
  ok("sales report: paneer has litres-equiv 50 + COGS + profit (not —)", !!pr && near(pr.litresEquiv, 50) && pr.cogsPaise != null && pr.cogsPaise > 0 && pr.profitPaise != null, JSON.stringify(pr && { l: pr.litresEquiv, cogs: pr.cogsPaise, profit: pr.profitPaise }));

  // disable → same sale draws ZERO
  await patchSolidsCogsConfig({ enabled: false });
  const s2 = await settleDay(DAY, actor);
  ok("solids DISABLED: paneer draws 0 L (revenue-only)", s2.b2b.allocatedLitres === 0 && s2.b2b.costPaise === 0, JSON.stringify({ l: s2.b2b.allocatedLitres, c: s2.b2b.costPaise }));
}

async function cleanup() {
  try {
    await db.$transaction(async (tx) => { await reverseByRef(tx, `settle:${DAY}:B2B`); await reverseByRef(tx, `settle:${DAY}:RETAIL`); }).catch(() => {});
    if (tankerId) await db.tankerConsumption.deleteMany({ where: { tankerId } }).catch(() => {});
    if (orderIds.length) {
      await db.businessOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    }
    if (tankerId) await db.milkTanker.deleteMany({ where: { id: tankerId } }).catch(() => {});
    if (pricingIds.length) { await db.businessPricingHistory.deleteMany({ where: { pricingId: { in: pricingIds } } }).catch(() => {}); await db.businessPricing.deleteMany({ where: { id: { in: pricingIds } } }).catch(() => {}); }
    if (bizId) { await db.auditLog.deleteMany({ where: { target: { startsWith: (await db.business.findUnique({ where: { id: bizId }, select: { code: true } }))?.code ?? "___" } } }).catch(() => {}); await db.business.deleteMany({ where: { id: bizId } }).catch(() => {}); }
    await db.auditLog.deleteMany({ where: { action: "milk.settle", target: { startsWith: DAY } } }).catch(() => {});
    if (hadCfg) await db.appSetting.update({ where: { key: SOLIDS_COGS_KEY }, data: { value: priorCfg as object } }).catch(() => {});
    else await db.appSetting.deleteMany({ where: { key: SOLIDS_COGS_KEY } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Solids COGS (milk-equiv yields) E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
