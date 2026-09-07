/* Phase 2 reconciliation E2E — Retail Outlet channel + multi-channel coexistence.
   Records an OUTLET sale AND a WAREHOUSE sale on the same day (both draw the same
   tanker FIFO) and asserts the combined P&L + position reconcile, then voids both.
   DEV DB ONLY. Self-cleaning. */
import { db } from "../lib/db";
import { istDayWindow } from "../lib/delivery/stats";
import { getInventory } from "../lib/milk/tanker";
import { milkInventorySummary } from "../lib/milk/inventory";
import { mbDailyPnl } from "../lib/milk-business/pnl";
import { createOutlet, setOutletPrice, createOutletSale, voidOutletSale } from "../lib/milk-business/outlet";
import { createWarehouseCustomer, setCustomerPrice, createWarehouseSale, voidWarehouseSale } from "../lib/milk-business/warehouse";

let pass = 0, fail = 0;
const approx = (a: number, b: number, t = 0.5) => Math.abs(a - b) <= t;
function ok(name: string, cond: boolean, extra?: unknown) { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra != null ? JSON.stringify(extra) : ""); } }

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) throw new Error("REFUSING — not the dev DB: " + url);
  const DAY = "2026-09-08";
  const { start } = istDayWindow(DAY);

  const invBefore = await getInventory();
  const pnlBefore = await mbDailyPnl(DAY);

  // outlet @ ₹80/L, warehouse customer @ ₹75/L
  const outlet = await createOutlet({ name: "E2E Outlet", location: "Test Rd" }, { role: "super_admin" });
  await setOutletPrice(outlet.id, 8000, "2026-09-01", { role: "super_admin" });
  const cust = await createWarehouseCustomer({ name: "E2E WH" }, { role: "super_admin" });
  await setCustomerPrice(cust.id, 7500, "2026-09-01", { role: "super_admin" });

  // outlet 50 L @ ₹80 = ₹4,000 ; warehouse 30 L @ ₹75 = ₹2,250 (same day)
  const os = await createOutletSale({ outletId: outlet.id, litres: 50, saleDate: DAY, paymentMode: "cash" }, { role: "super_admin" });
  const ws = await createWarehouseSale({ customerId: cust.id, litres: 30, saleDate: DAY, paymentMode: "upi" }, { role: "super_admin" });

  ok("outlet price snapshotted from fixed rate (₹80/L)", os.sale.pricePerLitrePaise === 8000, os.sale.pricePerLitrePaise);
  ok("outlet net = ₹4,000", os.sale.netPaise === 400000, os.sale.netPaise);
  ok("warehouse net = ₹2,250", ws.sale.netPaise === 225000, ws.sale.netPaise);

  // per-channel FIFO draws
  const [oCons, wCons, privCons] = await Promise.all([
    db.tankerConsumption.aggregate({ where: { date: start, channel: "OUTLET" }, _sum: { litres: true, costPaise: true } }),
    db.tankerConsumption.aggregate({ where: { date: start, channel: "WAREHOUSE" }, _sum: { litres: true, costPaise: true } }),
    db.tankerConsumption.aggregate({ where: { date: start, channel: { in: ["B2B", "WAREHOUSE", "OUTLET"] } }, _sum: { costPaise: true } }),
  ]);
  ok("OUTLET drew 50 L", approx(oCons._sum.litres ?? 0, 50), oCons._sum.litres);
  ok("WAREHOUSE drew 30 L", approx(wCons._sum.litres ?? 0, 30), wCons._sum.litres);

  // combined live inventory −80 L
  const invAfter = await getInventory();
  ok("live inventory −80 L (both channels)", approx(invAfter.remainingLitres, invBefore.remainingLitres - 80), { before: invBefore.remainingLitres, after: invAfter.remainingLitres });

  // combined P&L
  const pnl = await mbDailyPnl(DAY);
  ok("P&L outlet revenue += ₹4,000", pnl.outletRevenuePaise === pnlBefore.outletRevenuePaise + 400000, pnl.outletRevenuePaise);
  ok("P&L warehouse revenue += ₹2,250", pnl.warehouseRevenuePaise === pnlBefore.warehouseRevenuePaise + 225000, pnl.warehouseRevenuePaise);
  ok("P&L revenue = B2B + warehouse + outlet", pnl.revenuePaise === pnl.b2bRevenuePaise + pnl.warehouseRevenuePaise + pnl.outletRevenuePaise, pnl);
  ok("P&L COGS reconciles with the private ledger", approx(pnl.cogsPaise, privCons._sum.costPaise ?? 0, 1), { pnl: pnl.cogsPaise, ledger: privCons._sum.costPaise });
  ok("P&L identity: net = revenue − COGS − expenses", pnl.netProfitPaise === pnl.revenuePaise - pnl.cogsPaise - pnl.expensesPaise, pnl);
  ok("litresSold = 80 (drawn FIFO)", approx(pnl.litresSold, 80), pnl.litresSold);
  console.log(`  → revenue ₹${(pnl.revenuePaise / 100).toFixed(2)} − COGS ₹${(pnl.cogsPaise / 100).toFixed(2)} − exp ₹${(pnl.expensesPaise / 100).toFixed(2)} = net ₹${(pnl.netProfitPaise / 100).toFixed(2)}`);

  // position reconciles with BOTH channels
  const sum = await milkInventorySummary(DAY);
  const closingCalc = sum.openingBalance + sum.procurement + sum.freshout - sum.retailConsumed - sum.b2bConsumed - sum.wastage;
  ok("inventory equation balances", approx(closingCalc, sum.closingBalance), { closingCalc, closing: sum.closingBalance });
  ok("closing == live (reconciled)", sum.reconciled && approx(sum.closingBalance, invAfter.remainingLitres), { closing: sum.closingBalance, live: invAfter.remainingLitres });
  ok("warehouse+outlet (80 L) folded into retail outflow", approx(sum.retailConsumed, 80), sum.retailConsumed);

  // VOID both → full reversal
  await voidOutletSale(os.sale.id, "e2e", { role: "super_admin" });
  await voidWarehouseSale(ws.sale.id, "e2e", { role: "super_admin" });
  const invVoid = await getInventory();
  const pnlVoid = await mbDailyPnl(DAY);
  ok("VOID both: stock restored to baseline", approx(invVoid.remainingLitres, invBefore.remainingLitres), { restored: invVoid.remainingLitres, baseline: invBefore.remainingLitres });
  ok("VOID both: revenue back to baseline", pnlVoid.revenuePaise === pnlBefore.revenuePaise, { after: pnlVoid.revenuePaise, base: pnlBefore.revenuePaise });

  // cleanup
  await db.outletSale.deleteMany({ where: { outletId: outlet.id } });
  await db.outletPricing.deleteMany({ where: { outletId: outlet.id } });
  await db.retailOutlet.delete({ where: { id: outlet.id } });
  await db.warehouseSale.deleteMany({ where: { customerId: cust.id } });
  await db.warehouseCustomerPricing.deleteMany({ where: { customerId: cust.id } });
  await db.warehouseCustomer.delete({ where: { id: cust.id } });

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error("E2E FAILED:", e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
