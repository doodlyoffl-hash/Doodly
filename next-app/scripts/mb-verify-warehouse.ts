/* Phase 1 reconciliation E2E — Warehouse walk-in channel. DEV DB ONLY.
   Exercises the REAL service + settle engine and asserts the financial
   identities: revenue = net sale, COGS draws FIFO, position reconciles
   (closing == live available), P&L net = revenue − COGS − expenses, and
   VOID cleanly reverses everything. Self-cleaning. */
import { db } from "../lib/db";
import { istDayWindow } from "../lib/delivery/stats";
import { getInventory } from "../lib/milk/tanker";
import { milkInventorySummary } from "../lib/milk/inventory";
import { mbDailyPnl } from "../lib/milk-business/pnl";
import { createWarehouseCustomer, setCustomerPrice, createWarehouseSale, voidWarehouseSale } from "../lib/milk-business/warehouse";

let pass = 0, fail = 0;
const approx = (a: number, b: number, t = 0.5) => Math.abs(a - b) <= t;
function ok(name: string, cond: boolean, extra?: unknown) { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra != null ? JSON.stringify(extra) : ""); } }

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) throw new Error("REFUSING — not the dev DB: " + url);

  const DAY = "2026-09-08"; // the seed tanker's day (one open lot)
  const { start } = istDayWindow(DAY);

  const invBefore = await getInventory();
  const pnlBefore = await mbDailyPnl(DAY);
  console.log(`baseline: live ${invBefore.remainingLitres} L · wh revenue ₹${(pnlBefore.warehouseRevenuePaise / 100).toFixed(2)} · cogs ₹${(pnlBefore.cogsPaise / 100).toFixed(2)}`);

  // 1) customer + price ₹75/L (above the ~₹69.18/L tanker cost → positive gross)
  const cust = await createWarehouseCustomer({ name: "E2E Walk-in", mobile: "9990001111" }, { role: "super_admin" });
  await setCustomerPrice(cust.id, 7500, "2026-09-01", { role: "super_admin" });

  // 2) record 100 L sale — price auto-resolves from the customer's rate
  const { sale, settlement } = await createWarehouseSale({ customerId: cust.id, litres: 100, saleDate: DAY, paymentMode: "cash", paymentStatus: "PAID" }, { role: "super_admin" });
  console.log(`\nsale ${sale.code}: ${sale.litres} L @ ₹${(sale.pricePerLitrePaise / 100)} = net ₹${(sale.netPaise / 100).toFixed(2)}`);

  ok("price snapshotted from customer rate (₹75/L)", sale.pricePerLitrePaise === 7500, sale.pricePerLitrePaise);
  ok("gross = litres × price", sale.grossPaise === 750000, sale.grossPaise);
  ok("net = gross − discount", sale.netPaise === 750000, sale.netPaise);

  // 3) COGS drawn FIFO on the WAREHOUSE channel
  const whCons = await db.tankerConsumption.aggregate({ where: { date: start, channel: "WAREHOUSE" }, _sum: { litres: true, costPaise: true } });
  ok("WAREHOUSE consumption drew 100 L", approx(whCons._sum.litres ?? 0, 100), whCons._sum.litres);
  ok("settlement reports the warehouse draw", settlement != null && approx(settlement.warehouse.allocatedLitres, 100), settlement?.warehouse);

  // 4) live inventory dropped by exactly 100 L
  const invAfter = await getInventory();
  ok("live inventory −100 L", approx(invAfter.remainingLitres, invBefore.remainingLitres - 100), { before: invBefore.remainingLitres, after: invAfter.remainingLitres });

  // 5) P&L: revenue += net, COGS = warehouse FIFO cost, net = rev − COGS − expenses
  const pnl = await mbDailyPnl(DAY);
  const cogsExpected = whCons._sum.costPaise ?? 0;
  ok("P&L warehouse revenue = ₹7,500", pnl.warehouseRevenuePaise === pnlBefore.warehouseRevenuePaise + 750000, pnl.warehouseRevenuePaise);
  ok("P&L COGS reconciles with the WAREHOUSE ledger", approx(pnl.cogsPaise, pnlBefore.cogsPaise + cogsExpected, 1), { pnl: pnl.cogsPaise, expected: pnlBefore.cogsPaise + cogsExpected });
  ok("P&L identity: net = revenue − COGS − expenses", pnl.netProfitPaise === pnl.revenuePaise - pnl.cogsPaise - pnl.expensesPaise, pnl);
  console.log(`  → revenue ₹${(pnl.revenuePaise / 100).toFixed(2)} − COGS ₹${(pnl.cogsPaise / 100).toFixed(2)} − exp ₹${(pnl.expensesPaise / 100).toFixed(2)} = net ₹${(pnl.netProfitPaise / 100).toFixed(2)}`);

  // 6) position reconciles: opening + proc + freshout − retail(incl wh) − b2b − wastage = closing == live
  const sum = await milkInventorySummary(DAY);
  const closingCalc = sum.openingBalance + sum.procurement + sum.freshout - sum.retailConsumed - sum.b2bConsumed - sum.wastage;
  ok("inventory equation balances (opening+proc+fresh−sold=closing)", approx(closingCalc, sum.closingBalance), { closingCalc, closing: sum.closingBalance });
  ok("closing == live available (reconciled)", sum.reconciled && approx(sum.closingBalance, invAfter.remainingLitres), { closing: sum.closingBalance, live: invAfter.remainingLitres });
  ok("warehouse litres folded into retail outflow", approx(sum.retailConsumed, 100), sum.retailConsumed);

  // 7) VOID reverses everything
  await voidWarehouseSale(sale.id, "e2e cleanup", { role: "super_admin" });
  const invVoid = await getInventory();
  const pnlVoid = await mbDailyPnl(DAY);
  const whConsVoid = await db.tankerConsumption.aggregate({ where: { date: start, channel: "WAREHOUSE" }, _sum: { litres: true } });
  ok("VOID: stock restored to baseline", approx(invVoid.remainingLitres, invBefore.remainingLitres), { restored: invVoid.remainingLitres, baseline: invBefore.remainingLitres });
  ok("VOID: warehouse revenue removed from P&L", pnlVoid.warehouseRevenuePaise === pnlBefore.warehouseRevenuePaise, pnlVoid.warehouseRevenuePaise);
  ok("VOID: WAREHOUSE FIFO draw reversed", approx(whConsVoid._sum.litres ?? 0, 0), whConsVoid._sum.litres);

  // cleanup (dev DB): hard-remove the test rows + restore settle
  await db.warehouseSale.deleteMany({ where: { customerId: cust.id } });
  await db.warehouseCustomerPricing.deleteMany({ where: { customerId: cust.id } });
  await db.warehouseCustomer.delete({ where: { id: cust.id } });

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("E2E FAILED:", e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
