/* Completeness E2E — walk-in credit sale → outstanding → collect → paid. DEV DB ONLY. */
import { db } from "../lib/db";
import { createWarehouseCustomer, setCustomerPrice, createWarehouseSale, collectWarehousePayment, warehouseOutstanding, voidWarehouseSale } from "../lib/milk-business/warehouse";

let pass = 0, fail = 0;
const approx = (a: number, b: number, t = 0.5) => Math.abs(a - b) <= t;
function ok(n: string, c: boolean, x?: unknown) { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, x != null ? JSON.stringify(x) : ""); } }

async function main() {
  if (!/localhost:5433|doodly_dev/.test(process.env.DATABASE_URL || "")) throw new Error("REFUSING — not dev DB");
  const DAY = "2026-09-08";
  const cust = await createWarehouseCustomer({ name: "E2E Credit" }, { role: "super_admin" });
  await setCustomerPrice(cust.id, 7500, "2026-09-01", { role: "super_admin" });

  // credit sale: 10 L @ ₹75 = ₹750, unpaid
  const { sale } = await createWarehouseSale({ customerId: cust.id, litres: 10, saleDate: DAY, paymentStatus: "PENDING" }, { role: "super_admin" });
  ok("credit sale created PENDING, paid 0", sale.paymentStatus === "PENDING" && sale.paidPaise === 0, sale);

  const out1 = await warehouseOutstanding();
  const mine1 = out1.find((r) => r.customerId === cust.id);
  ok("outstanding shows ₹750 for the customer", !!mine1 && mine1.outstandingPaise === 75000, mine1);

  // collect ₹500 → PARTIAL, remaining ₹250
  const c1 = await collectWarehousePayment(sale.id, 50000, "cash", undefined, { role: "super_admin" });
  ok("partial collect: applied ₹500, remaining ₹250", c1.applied === 50000 && c1.remaining === 25000, c1);
  ok("sale now PARTIAL", c1.sale.paymentStatus === "PARTIAL", c1.sale.paymentStatus);

  const out2 = await warehouseOutstanding();
  ok("outstanding now ₹250", (out2.find((r) => r.customerId === cust.id)?.outstandingPaise ?? 0) === 25000, out2.find((r) => r.customerId === cust.id));

  // collect the rest (overpay guard: ask ₹300, only ₹250 applied)
  const c2 = await collectWarehousePayment(sale.id, 30000, "upi", undefined, { role: "super_admin" });
  ok("final collect caps at outstanding (₹250 applied)", c2.applied === 25000 && c2.remaining === 0, c2);
  ok("sale now PAID", c2.sale.paymentStatus === "PAID" && c2.sale.paidPaise === 75000, c2.sale);

  const out3 = await warehouseOutstanding();
  ok("customer no longer in outstanding", !out3.find((r) => r.customerId === cust.id), out3);

  // collecting on a fully-paid sale is rejected
  let rejected = false; try { await collectWarehousePayment(sale.id, 100, "cash", undefined, { role: "super_admin" }); } catch { rejected = true; }
  ok("collect on fully-paid sale is rejected", rejected);

  // cleanup: void (reverse milk draw) + delete
  await voidWarehouseSale(sale.id, "e2e", { role: "super_admin" });
  await db.warehouseSale.deleteMany({ where: { customerId: cust.id } });
  await db.warehouseCustomerPricing.deleteMany({ where: { customerId: cust.id } });
  await db.warehouseCustomer.delete({ where: { id: cust.id } });

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error("E2E FAILED:", e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
