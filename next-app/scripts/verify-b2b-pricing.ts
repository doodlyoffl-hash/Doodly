/* E2E for unit-aware B2B pricing (live DB, self-cleaning).
   Proves: a KG rule and a Litre rule coexist for the SAME product (the uniqueness
   fix), order creation prices each line from the DB per-unit rule (server-authoritative),
   and a later price change never mutates a past order (historical accuracy).
     Scenario 1: milk ₹72/KG × 100  = ₹7,200
     Scenario 2: milk ₹78/Litre × 100 = ₹7,800
   Run: TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/verify-b2b-pricing.ts */
import { PrismaClient } from "@prisma/client";
import { createPricing, updatePricing } from "../lib/b2b/pricing";
import { createOrder } from "../lib/b2b/service";

const db = new PrismaClient();
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const stamp = Date.now();
const actor = { actorId: undefined as string | undefined, actorRole: "super_admin" };
let bizId = "";
const pricingIds: string[] = [];
const orderIds: string[] = [];

async function run() {
  const biz = await db.business.create({ data: {
    code: `B2B-E2E-${stamp}`, name: `B2B Units E2E ${stamp}`, type: "RESTAURANT", contactPerson: "Test", mobile: "9000000000",
    line1: "1 Test St", city: "Vijayawada", state: "AP", pincode: "520010", paymentTerm: "CASH", discountBps: 0, creditLimitPaise: 0, active: true,
  } });
  bizId = biz.id;

  // two rules for the SAME product, different units — must both succeed (unit is in the uniqueness key)
  const kg = await createPricing({ businessId: bizId, productSlug: "milk", productName: "A2 Buffalo Milk", unit: "KG", basePricePaise: 7200, b2bPricePaise: 7200, gstBps: 0, minQty: 1 }, actor);
  pricingIds.push(kg.id);
  ok("KG rule created (₹72/KG)", !!kg.id);
  let litreErr = "";
  const litre = await createPricing({ businessId: bizId, productSlug: "milk", productName: "A2 Buffalo Milk", unit: "Litres", basePricePaise: 7800, b2bPricePaise: 7800, gstBps: 0, minQty: 1 }, actor).catch((e) => { litreErr = (e as Error).message; return null as any; });
  if (litre?.id) pricingIds.push(litre.id);
  ok("Litre rule coexists with KG rule (uniqueness includes unit)", !!litre?.id, litreErr);

  // order: 100 KG + 100 Litres, client sends a bogus price (must be ignored)
  const order = await createOrder({
    businessId: bizId, deliveryDate: new Date().toISOString().slice(0, 10), deliveryTime: "7:00 AM",
    items: [
      { productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "KG", unitPricePaise: 1 },
      { productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "Litres", unitPricePaise: 1 },
    ],
  }, actor);
  orderIds.push(order.id);
  const kgLine = order.items.find((i: any) => i.unit === "KG");
  const lLine = order.items.find((i: any) => i.unit === "Litres");
  ok("Scenario 1 — KG line billed ₹72/KG × 100 = ₹7,200", kgLine?.unitPricePaise === 7200 && kgLine?.lineTotalPaise === 720000, JSON.stringify({ price: kgLine?.unitPricePaise, total: kgLine?.lineTotalPaise }));
  ok("Scenario 2 — Litre line billed ₹78/Litre × 100 = ₹7,800", lLine?.unitPricePaise === 7800 && lLine?.lineTotalPaise === 780000, JSON.stringify({ price: lLine?.unitPricePaise, total: lLine?.lineTotalPaise }));
  ok("order total = ₹15,000 (7,200 + 7,800)", order.totalPaise === 1500000, `${order.totalPaise}`);

  // change the KG price → past order must NOT change; a NEW order uses the new price
  await updatePricing(kg.id, { b2bPricePaise: 8000, basePricePaise: 8000, reason: "rate revision" }, actor);
  const kgLineAfter = await db.businessOrderItem.findFirst({ where: { orderId: order.id, unit: "KG" }, select: { unitPricePaise: true } });
  ok("historical: old order's KG line still ₹72 after price change to ₹80", kgLineAfter?.unitPricePaise === 7200, `${kgLineAfter?.unitPricePaise}`);
  const order2 = await createOrder({ businessId: bizId, deliveryDate: new Date().toISOString().slice(0, 10), deliveryTime: "7:00 AM", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "KG", unitPricePaise: 1 }] }, actor);
  orderIds.push(order2.id);
  ok("new order after change uses the new ₹80/KG (₹8,000)", order2.items[0]?.unitPricePaise === 8000 && order2.totalPaise === 800000, JSON.stringify({ price: order2.items[0]?.unitPricePaise, total: order2.totalPaise }));
}

async function cleanup() {
  try {
    if (orderIds.length) {
      await db.businessOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
      await db.businessOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
    }
    if (pricingIds.length) {
      await db.businessPricingHistory.deleteMany({ where: { pricingId: { in: pricingIds } } }).catch(() => {});
      await db.businessPricing.deleteMany({ where: { id: { in: pricingIds } } }).catch(() => {});
    }
    if (bizId) await db.business.deleteMany({ where: { id: bizId } }).catch(() => {});
  } catch (e) { console.error("cleanup:", (e as Error).message); }
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Unit-aware B2B pricing E2E — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
