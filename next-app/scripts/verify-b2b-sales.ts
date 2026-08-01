/* E2E for the B2B Sales Report (by unit) — live DB, self-cleaning.
   Seeds a business + a 100-KG milk order + a 50-Litre milk order on a FUTURE day
   (so only these fall in range) and asserts the report groups by (product,unit)
   with correct revenue, ASP, and KG-vs-Litre analytics.
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-b2b-sales.ts */
import { PrismaClient } from "@prisma/client";
import { createPricing } from "../lib/b2b/pricing";
import { createOrder } from "../lib/b2b/service";
import { b2bSalesReport, b2bSalesReportCsv } from "../lib/b2b/sales-report";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const actor = { actorRole: "super_admin" };
const DAY = "2027-03-15";   // future — no real orders here
let bizId = "";
const pricingIds: string[] = [];
const orderIds: string[] = [];

async function run() {
  const biz = await db.business.create({ data: { code: `B2B-SALES-${stamp}`, name: `B2B Sales E2E ${stamp}`, type: "RESTAURANT", contactPerson: "T", mobile: "9000000001", line1: "1 St", city: "Vijayawada", state: "AP", pincode: "520010", paymentTerm: "CASH", discountBps: 0, creditLimitPaise: 0, active: true } });
  bizId = biz.id;
  for (const [unit, base] of [["KG", 7200], ["Litres", 7800]] as const) {
    const p = await createPricing({ businessId: bizId, productSlug: "milk", productName: "A2 Buffalo Milk", unit, basePricePaise: base, b2bPricePaise: base, gstBps: 0, minQty: 1 }, actor);
    pricingIds.push(p.id);
  }
  const o1 = await createOrder({ businessId: bizId, deliveryDate: DAY, deliveryTime: "7 AM", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "KG", unitPricePaise: 1 }] }, actor);
  const o2 = await createOrder({ businessId: bizId, deliveryDate: DAY, deliveryTime: "7 AM", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 50, unit: "Litres", unitPricePaise: 1 }] }, actor);
  orderIds.push(o1.id, o2.id);

  const rep = await b2bSalesReport(DAY, DAY);
  const kg = rep.data.find((r) => r.unit === "KG");
  const lit = rep.data.find((r) => r.unit === "Litres");
  ok("report groups by (product, unit) — 2 rows", rep.data.length === 2, `${rep.data.length}`);
  ok("KG row: 100 qty · ₹7,200 revenue · ₹72 ASP", kg?.quantity === 100 && kg?.revenuePaise === 720000 && kg?.aspPaise === 7200, JSON.stringify(kg));
  ok("Litre row: 50 qty · ₹3,900 revenue · ₹78 ASP", lit?.quantity === 50 && lit?.revenuePaise === 390000 && lit?.aspPaise === 7800, JSON.stringify(lit));
  ok("KG line drew ~97.09 L equiv (100/1.03)", !!kg && Math.abs(kg.litresEquiv - 97.09) < 0.02, `${kg?.litresEquiv}`);
  ok("analytics: KG revenue ₹7,200 vs Litre revenue ₹3,900", rep.analytics.kgRevenuePaise === 720000 && rep.analytics.litreRevenuePaise === 390000, JSON.stringify({ kg: rep.analytics.kgRevenuePaise, l: rep.analytics.litreRevenuePaise }));
  ok("analytics: ASP per KG ₹72 · per Litre ₹78", rep.analytics.aspPerKgPaise === 7200 && rep.analytics.aspPerLitrePaise === 7800, JSON.stringify({ kg: rep.analytics.aspPerKgPaise, l: rep.analytics.aspPerLitrePaise }));
  ok("total revenue ₹11,100", rep.analytics.revenuePaise === 1110000, `${rep.analytics.revenuePaise}`);
  ok("CSV renders header + total row", b2bSalesReportCsv(rep).includes("ASP / unit") && b2bSalesReportCsv(rep).includes("TOTAL"), "");
}

async function cleanup() {
  try {
    if (orderIds.length) {
      await db.businessOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    }
    if (pricingIds.length) { await db.businessPricingHistory.deleteMany({ where: { pricingId: { in: pricingIds } } }).catch(() => {}); await db.businessPricing.deleteMany({ where: { id: { in: pricingIds } } }).catch(() => {}); }
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== B2B Sales Report E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
