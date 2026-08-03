/* Runtime E2E for the Automated Business Invoice system: auto-generate on DELIVERED,
   never before, idempotent, WhatsApp+Email tracked, frozen, dashboard summary. Throwaway
   local Postgres (scripts/_devverify.mjs verify-b2b-invoices.ts). */
import { db } from "@/lib/db";
import { updateOrderStatus, cancelOrder } from "@/lib/b2b/service";
import { b2bInvoiceSummary, listInvoices, recordInvoicePayment, b2bInvoicesReport } from "@/lib/b2b/invoices";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 9);

async function mkBiz() {
  return (await db.business.create({ data: { code: `B-${rnd()}`, name: "Test Mess", type: "RESTAURANT", contactPerson: "Ravi", mobile: "9876543210", email: "mess@test.local", line1: "1 Rd", pincode: "520001", gst: "36ABCDE1234F1Z5", paymentTerm: "CASH" } })).id;
}
async function mkOrder(bizId: string, status: string, total: number, tax: number) {
  return (await db.businessOrder.create({
    data: {
      code: `ORD-${rnd()}`, businessId: bizId, status: status as never, deliveryDate: new Date(), deliveryTime: "6 AM",
      subtotalPaise: total - tax, taxPaise: tax, totalPaise: total, paidPaise: 0, paymentTerm: "CASH", paymentStatus: "PENDING",
      items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 50, unit: "KG", unitPricePaise: Math.round(total / 50), lineTotalPaise: total }] },
    }, select: { id: true },
  })).id;
}
const invCount = (orderId: string) => db.businessInvoice.count({ where: { orderId } });

async function run() {
  const biz = await mkBiz();

  // ---- S1: OUT_FOR_DELIVERY → DELIVERED auto-generates exactly one invoice ----
  const o1 = await mkOrder(biz, "OUT_FOR_DELIVERY", 500000, 25000);
  await updateOrderStatus({ id: o1, status: "DELIVERED", actorRole: "system" });
  const inv1 = await db.businessInvoice.findUnique({ where: { orderId: o1 } });
  ok("S1: DELIVERED auto-generates an invoice", !!inv1 && !!inv1.number, inv1?.number);
  ok("S1: invoice freezes GST from the order (₹250)", (inv1?.gstPaise ?? -1) === 25000, String(inv1?.gstPaise));
  ok("S1: WhatsApp delivery tracked (path ran)", ["PENDING", "SKIPPED", "SENT", "FAILED"].includes(inv1?.whatsappStatus ?? ""), inv1?.whatsappStatus);
  ok("S1: Email delivery tracked (path ran)", ["PENDING", "SKIPPED", "SENT", "FAILED"].includes(inv1?.emailStatus ?? ""), inv1?.emailStatus);
  const ord1 = await db.businessOrder.findUnique({ where: { id: o1 }, select: { revenuePaise: true, deliveredAt: true } });
  ok("S1: order recognized — revenue frozen (net GST) + deliveredAt", ord1?.revenuePaise === 475000 && ord1?.deliveredAt != null, JSON.stringify({ rev: ord1?.revenuePaise, at: !!ord1?.deliveredAt }));
  const events = await db.businessInvoiceEvent.findMany({ where: { invoiceId: inv1!.id }, select: { type: true } });
  ok("S1: audit trail has a 'created' event + a channel send event", events.some((e) => e.type === "created") && events.some((e) => e.type.startsWith("email") || e.type.startsWith("whatsapp")), events.map((e) => e.type).join(","));

  // ---- S2: idempotent — re-marking DELIVERED never duplicates ----
  await updateOrderStatus({ id: o1, status: "DELIVERED", actorRole: "system" });
  ok("S2: idempotent — still exactly 1 invoice", (await invCount(o1)) === 1, String(await invCount(o1)));

  // ---- S3: NEVER generate for non-delivered ----
  const o2 = await mkOrder(biz, "PENDING", 200000, 0);
  ok("S3: PENDING order has no invoice", (await invCount(o2)) === 0);
  await updateOrderStatus({ id: o2, status: "CONFIRMED", actorRole: "system" });
  ok("S3: CONFIRMED order still has no invoice", (await invCount(o2)) === 0);
  await updateOrderStatus({ id: o2, status: "PREPARING", actorRole: "system" });
  await updateOrderStatus({ id: o2, status: "OUT_FOR_DELIVERY", actorRole: "system" });
  ok("S3: OUT_FOR_DELIVERY still has no invoice", (await invCount(o2)) === 0);

  // ---- S4: cancelled order → no invoice ----
  const o3 = await mkOrder(biz, "OUT_FOR_DELIVERY", 100000, 5000);
  await cancelOrder({ id: o3, actorRole: "system" });
  ok("S4: cancelled order has no invoice", (await invCount(o3)) === 0);

  // ---- S5: historical invoice immutable — the frozen GST is unaffected by later state ----
  await db.businessOrder.update({ where: { id: o2 }, data: { status: "DELIVERED" } }).catch(() => {});   // manual flip (bypasses service) — should NOT create an invoice
  const inv1c = await db.businessInvoice.findUnique({ where: { orderId: o1 }, select: { gstPaise: true } });
  ok("S5: earlier invoice's frozen GST unchanged (₹250)", inv1c?.gstPaise === 25000, String(inv1c?.gstPaise));

  // ---- Dashboard summary (respects filters) ----
  const sum = await b2bInvoiceSummary({});
  ok("Summary: exactly 1 invoice total (only the DELIVERED-via-service order)", sum.totalInvoices === 1, String(sum.totalInvoices));
  ok("Summary: value = the invoiced order total ₹5,000; outstanding = ₹5,000 (unpaid)", sum.totalValuePaise === 500000 && sum.outstandingPaise === 500000, JSON.stringify({ v: sum.totalValuePaise, o: sum.outstandingPaise }));
  ok("Summary: unpaid=1 (ISSUED), paid=0, overdue=0", sum.unpaid === 1 && sum.paid === 0 && sum.overdue === 0, JSON.stringify({ u: sum.unpaid, p: sum.paid, od: sum.overdue }));
  const sumBiz = await b2bInvoiceSummary({ businessId: biz });
  ok("Summary(by business) still 1 invoice", sumBiz.totalInvoices === 1);
  const sumOther = await b2bInvoiceSummary({ q: "nonexistent-xyz" });
  ok("Summary(non-matching search) → 0", sumOther.totalInvoices === 0);

  // ---- S6: date-type filter (Step 7) — the invoice keys off delivery date too ----
  const today = new Date(); const dayStr = new Date(today.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const byDelivery = await listInvoices({ dateType: "delivery", from: dayStr, to: dayStr });
  ok("S6: dateType=delivery finds the invoice by its order's delivery date", byDelivery.total === 1, String(byDelivery.total));
  const byDeliveryPast = await listInvoices({ dateType: "delivery", from: "2000-01-01", to: "2000-01-02" });
  ok("S6: dateType=delivery outside range → 0", byDeliveryPast.total === 0, String(byDeliveryPast.total));

  // ---- S7: mark-paid (dashboard ₹ action) → PAID + summary flips ----
  await recordInvoicePayment(inv1!.id, { amountPaise: 500000, method: "Cash", actorRole: "system" });
  const sumPaid = await b2bInvoiceSummary({});
  ok("S7: after full payment — paid=1, unpaid=0, outstanding=0", sumPaid.paid === 1 && sumPaid.unpaid === 0 && sumPaid.outstandingPaise === 0, JSON.stringify({ p: sumPaid.paid, u: sumPaid.unpaid, o: sumPaid.outstandingPaise }));

  // ---- S8: filtered register export (Step 12) — MilkReport of the on-screen set ----
  const rep = await b2bInvoicesReport({});
  ok("S8: register export has the 1 invoice row + 10 columns + a TOTAL row", rep.rowCount === 1 && rep.columns.length === 10 && !!rep.totalRow && rep.totalRow[0] === "TOTAL", JSON.stringify({ rows: rep.rowCount, cols: rep.columns.length }));
  ok("S8: register row shows the invoice number + ₹5,000 amount, fully paid", rep.rows[0][0] === inv1!.number && rep.rows[0][7] === "₹5,000" && rep.rows[0][9] === "₹0", JSON.stringify(rep.rows[0]));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== B2B Invoice system E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
