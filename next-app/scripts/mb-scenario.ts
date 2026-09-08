/* Populate (or remove) a realistic DEV scenario so the private module's P&L report
   shows real numbers across every line: a B2B order, a warehouse walk-in sale, a
   retail-outlet sale (all drawing FIFO COGS from the seed tanker) and a milk expense.

   Everything goes through the REAL engines (b2b service / milk-business warehouse+
   outlet / expenses) — no hand-written rows — so the numbers reconcile exactly like
   production would. All demo entities carry a "(demo)" marker so --clean removes
   precisely them and re-settles the day back to the clean single-tanker baseline.

   DEV DB ONLY.  Usage:  --seed   |   --clean */
import { db } from "../lib/db";
import { istDayWindow, istISO } from "../lib/delivery/stats";
import { registerBusiness, createOrder, updateOrderStatus } from "../lib/b2b/service";
import { createPricing } from "../lib/b2b/pricing";
import { createTanker } from "../lib/milk/tanker";
import { createWarehouseSale } from "../lib/milk-business/warehouse";
import { createOutlet, createOutletSale, setOutletPrice } from "../lib/milk-business/outlet";
import { listMilkExpenseCategories, createMilkExpense } from "../lib/milk-business/expenses";
import { settleDay } from "../lib/milk/settle";

const MARK = "(demo)";
const BIZ_NAME = `Scenario Cafe ${MARK}`;
const OUTLET_NAME = `Scenario Outlet ${MARK}`;
const WH_NAME = `Scenario Walk-in ${MARK}`;
const EXP_TITLE = `Diesel — scenario ${MARK}`;
const bizActor = { actorRole: "super_admin" as const };
const mbActor = { role: "super_admin" as const };

function assertDev() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) throw new Error("REFUSING — not the dev DB: " + url);
}

async function seed() {
  const { iso } = istDayWindow(undefined);
  const t = await db.milkTanker.findFirst({ where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: 0 } }, orderBy: { procurementDate: "asc" }, select: { code: true, remainingLitres: true } });
  if (!t) throw new Error("No open tanker with stock — add a tanker first (the scenario needs milk to draw COGS).");
  console.log(`Seeding scenario for ${iso}. FIFO source: ${t.code} (${t.remainingLitres} L open).`);

  // 1) B2B: register a café, price milk @ ₹72/KG (back-dated 1 day to dodge dev clock-skew),
  //    book 100 KG, then step the order through to DELIVERED (recognises revenue + FIFO COGS).
  const biz = await registerBusiness({ name: BIZ_NAME, type: "CAFE", contactPerson: "Ravi", mobile: "9876500001", line1: "12 MG Road", pincode: "520001", paymentTerm: "CASH" }, bizActor);
  await createPricing({ businessId: biz.id, productSlug: "milk", productName: "A2 Buffalo Milk", unit: "KG", basePricePaise: 7200, b2bPricePaise: 7200, gstBps: 0, minQty: 1, effectiveFrom: new Date(Date.now() - 86400000).toISOString() }, bizActor);
  const order = await createOrder({ businessId: biz.id, deliveryDate: iso, deliveryTime: "Morning (before 9 AM)", items: [{ productSlug: "milk", productName: "A2 Buffalo Milk", quantity: 100, unit: "KG", unitPricePaise: 0 }] }, bizActor);
  for (const s of ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"] as const) await updateOrderStatus({ id: order.id, status: s, ...bizActor });
  console.log(`  B2B: ${order.code} — 100 KG @ ₹72 delivered.`);

  // 2) Warehouse walk-in: 50 L @ ₹80/L, paid. Draws FIFO COGS on settle.
  const wh = await createWarehouseSale({ customerName: WH_NAME, litres: 50, pricePerLitrePaise: 8000, saleDate: iso, paymentStatus: "PAID" }, mbActor);
  console.log(`  Warehouse: ${wh.sale.code} — 50 L @ ₹80 = ₹${(wh.sale.netPaise / 100).toFixed(2)}.`);

  // 3) Retail outlet: 30 L @ ₹75/L, paid.
  const outlet = await createOutlet({ name: OUTLET_NAME, location: "Benz Circle" }, mbActor);
  const os = await createOutletSale({ outletId: outlet.id, litres: 30, pricePerLitrePaise: 7500, saleDate: iso, paymentStatus: "PAID" }, mbActor);
  console.log(`  Outlet: ${os.sale.code} — 30 L @ ₹75 = ₹${(os.sale.netPaise / 100).toFixed(2)}.`);

  // 4) Milk expense: ₹500 transport (milk-scoped → hits the private P&L only).
  const cats = await listMilkExpenseCategories();
  const cat = cats.find((c) => c.slug === "milk-business-transport") || cats[0];
  const exp = await createMilkExpense({ date: iso, title: EXP_TITLE, categoryId: cat.id, amountPaise: 50000, gstIncluded: false, gstPaise: 0, paymentMode: "CASH" }, { actorRole: "super_admin" });
  console.log(`  Expense: ${exp.code} — ₹500 ${cat.name}.`);

  // Final settle so every channel's COGS is drawn for the day.
  const s = await settleDay(iso, { actorRole: "super_admin", quiet: true });
  console.log(`Settled ${iso}: drew ${s.totalLitres.toFixed(2)} L, COGS ₹${(s.cogsPaise / 100).toFixed(2)} (retail ${s.retail.allocatedLitres.toFixed(1)} + b2b ${s.b2b.allocatedLitres.toFixed(1)} + wh ${s.warehouse.allocatedLitres.toFixed(1)} + outlet ${s.outlet.allocatedLitres.toFixed(1)}).`);
  console.log("\n✅ Scenario seeded. Open Reports → Profit & Loss for the current month.");
}

async function clean() {
  // B2B demo business + its orders (invoice/payment/items/events cascade or explicit).
  const biz = await db.business.findMany({ where: { name: { contains: MARK } }, select: { id: true } });
  const bizIds = biz.map((b) => b.id);
  if (bizIds.length) {
    const orders = await db.businessOrder.findMany({ where: { businessId: { in: bizIds } }, select: { id: true } });
    const oids = orders.map((o) => o.id);
    if (oids.length) {
      await db.businessInvoice.deleteMany({ where: { orderId: { in: oids } } });
      await db.businessPayment.deleteMany({ where: { orderId: { in: oids } } });
      await db.businessOrder.deleteMany({ where: { id: { in: oids } } });
    }
    await db.businessPricing.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.businessPayment.deleteMany({ where: { businessId: { in: bizIds } } });
    await db.business.deleteMany({ where: { id: { in: bizIds } } });
    console.log(`Removed ${bizIds.length} demo business(es) + orders/pricing.`);
  }
  // Warehouse demo sales.
  const whd = await db.warehouseSale.deleteMany({ where: { customerName: { contains: MARK } } });
  if (whd.count) console.log(`Removed ${whd.count} warehouse sale(s).`);
  // Outlet demo outlet + its sales + pricing.
  const outlets = await db.retailOutlet.findMany({ where: { name: { contains: MARK } }, select: { id: true } });
  const oIds = outlets.map((o) => o.id);
  if (oIds.length) {
    await db.outletSale.deleteMany({ where: { outletId: { in: oIds } } });
    await db.outletPricing.deleteMany({ where: { outletId: { in: oIds } } });
    await db.retailOutlet.deleteMany({ where: { id: { in: oIds } } });
    console.log(`Removed ${oIds.length} demo outlet(s) + sales/pricing.`);
  }
  // Milk demo expense(s).
  const expd = await db.expense.deleteMany({ where: { title: { contains: MARK } } });
  if (expd.count) console.log(`Removed ${expd.count} demo expense(s).`);

  // Re-settle today so the reversed sales return their milk to the tanker(s).
  const iso = istISO(new Date());
  const s = await settleDay(iso, { actorRole: "super_admin", quiet: true }).catch(() => null);
  if (s) console.log(`Re-settled ${iso}: drew ${s.totalLitres.toFixed(2)} L (should be ~0).`);

  // Demo continuity tankers (marker on supplier) — only when never drawn, so the
  // ledger stays consistent (the seed is the oldest, so a demo draw hits it, not these).
  const demoTankers = await db.milkTanker.findMany({ where: { deletedAt: null, supplier: { contains: MARK } }, select: { id: true, code: true, consumedLitres: true } });
  for (const dt of demoTankers) {
    const cons = await db.tankerConsumption.count({ where: { tankerId: dt.id } });
    if (cons > 0 || (dt.consumedLitres ?? 0) > 0.001) { console.warn(`SKIP tanker ${dt.code}: has consumption — leaving it.`); continue; }
    await db.milkOrderAllocation.deleteMany({ where: { tankerId: dt.id } });
    await db.milkTanker.delete({ where: { id: dt.id } });
    console.log(`Removed demo tanker ${dt.code}.`);
  }
  const t = await db.milkTanker.findFirst({ where: { deletedAt: null }, orderBy: { procurementDate: "asc" }, select: { code: true, litres: true, consumedLitres: true, remainingLitres: true } });
  if (t) console.log(`Tanker ${t.code}: consumed ${t.consumedLitres} L · remaining ${t.remainingLitres} L (of ${t.litres}).`);
  console.log("\n✅ Scenario cleaned.");
}

// Focused: a few warehouse walk-in sales so the Warehouse sales report has real rows
// (varied customers / litres / price / payment status). Removed by --clean (marker).
async function warehouse() {
  const { iso } = istDayWindow(undefined);
  const t = await db.milkTanker.findFirst({ where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: 0 } }, select: { code: true } });
  if (!t) throw new Error("No open tanker with stock — add a tanker first.");
  const sales: Array<{ name: string; litres: number; price: number; status: string }> = [
    { name: `Anand Sweets ${MARK}`, litres: 40, price: 8200, status: "PAID" },
    { name: `Sri Balaji Tiffins ${MARK}`, litres: 25, price: 8000, status: "CREDIT" },
    { name: `Green Cup Cafe ${MARK}`, litres: 60, price: 7800, status: "PAID" },
  ];
  for (const s of sales) {
    const r = await createWarehouseSale({ customerName: s.name, litres: s.litres, pricePerLitrePaise: s.price, saleDate: iso, paymentStatus: s.status }, mbActor);
    console.log(`  ${r.sale.code} — ${s.name}: ${s.litres} L @ ₹${(s.price / 100).toFixed(0)} = ₹${(r.sale.netPaise / 100).toFixed(2)} · ${s.status}`);
  }
  const s = await settleDay(iso, { actorRole: "super_admin", quiet: true });
  console.log(`Settled ${iso}: warehouse drew ${s.warehouse.allocatedLitres.toFixed(2)} L, COGS ₹${(s.warehouse.costPaise / 100).toFixed(2)}.`);
  console.log("\n✅ Warehouse sales seeded. Open Reports → Warehouse walk-in sales.");
}

// Focused: 2 retail outlets (FIXED per-litre price) with a few sales so the Outlet
// sales report has real rows. Removed by --clean (marker on the outlet name).
async function outlet() {
  const { iso } = istDayWindow(undefined);
  const t = await db.milkTanker.findFirst({ where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: 0 } }, select: { code: true } });
  if (!t) throw new Error("No open tanker with stock — add a tanker first.");
  const outlets: Array<{ name: string; location: string; price: number; sales: Array<{ litres: number; status: string }> }> = [
    { name: `Benz Circle Outlet ${MARK}`, location: "Benz Circle", price: 7600, sales: [{ litres: 35, status: "PAID" }, { litres: 20, status: "PAID" }] },
    { name: `Governorpet Outlet ${MARK}`, location: "Governorpet", price: 7400, sales: [{ litres: 45, status: "PAID" }, { litres: 15, status: "CREDIT" }] },
  ];
  for (const o of outlets) {
    const created = await createOutlet({ name: o.name, location: o.location }, mbActor);
    await setOutletPrice(created.id, o.price, new Date(Date.now() - 86400000).toISOString().slice(0, 10), mbActor);
    for (const s of o.sales) {
      const r = await createOutletSale({ outletId: created.id, litres: s.litres, pricePerLitrePaise: o.price, saleDate: iso, paymentStatus: s.status }, mbActor);
      console.log(`  ${r.sale.code} — ${o.name}: ${s.litres} L @ ₹${(o.price / 100).toFixed(0)} = ₹${(r.sale.netPaise / 100).toFixed(2)} · ${s.status}`);
    }
  }
  const s = await settleDay(iso, { actorRole: "super_admin", quiet: true });
  console.log(`Settled ${iso}: outlet drew ${s.outlet.allocatedLitres.toFixed(2)} L, COGS ₹${(s.outlet.costPaise / 100).toFixed(2)}.`);
  console.log("\n✅ Outlet sales seeded. Open Reports → Retail outlet sales.");
}

// Focused: grow the seed tanker's chain with 2 continuity tankers, then a small
// walk-in draw so FIFO consumes the OLDEST (seq 1) first — the Continuity chains
// report then shows a real multi-tanker chain with partial consumption. The demo
// tankers carry the "(demo)" marker in their supplier so --clean removes them.
async function continuity() {
  const { iso } = istDayWindow(undefined);
  const seed = await db.milkTanker.findFirst({ where: { deletedAt: null, status: "OPEN", remainingLitres: { gt: 0 } }, orderBy: { procurementDate: "asc" }, select: { code: true } });
  if (!seed) throw new Error("No open seed tanker — add a tanker first.");
  const a = await createTanker({ tankerNo: "TN-CH-A01", supplier: `Demo Dairy North ${MARK}`, quantityKg: 1200, fatPct: 6.8, transportPaise: 950000 }, bizActor);
  const b = await createTanker({ tankerNo: "TN-CH-B02", supplier: `Demo Dairy South ${MARK}`, quantityKg: 900, fatPct: 7.1, transportPaise: 950000 }, bizActor);
  console.log(`  Chain: ${seed.code} (PRIMARY) → ${a.code} (CONTINUITY) → ${b.code} (CONTINUITY).`);
  const wh = await createWarehouseSale({ customerName: `Chain Demo Buyer ${MARK}`, litres: 120, pricePerLitrePaise: 8000, saleDate: iso, paymentStatus: "PAID" }, mbActor);
  const s = await settleDay(iso, { actorRole: "super_admin", quiet: true });
  console.log(`  ${wh.sale.code} — 120 L drew ${s.totalLitres.toFixed(2)} L FIFO from the oldest tanker (seq 1).`);
  console.log("\n✅ Continuity chain seeded. Open Reports → Continuity chains.");
}

async function main() {
  assertDev();
  if (process.argv.includes("--clean")) return clean();
  if (process.argv.includes("--warehouse")) return warehouse();
  if (process.argv.includes("--outlet")) return outlet();
  if (process.argv.includes("--continuity")) return continuity();
  if (process.argv.includes("--seed")) return seed();
  console.log("Pass --seed, --warehouse, --outlet, --continuity or --clean.");
}
main().catch((e) => { console.error(e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
