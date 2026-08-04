/* Verify the Outstanding-ledger AUDIT TRAIL (Step 12) — every payment writes an audit row with
   invoice, business, amount, outstanding BEFORE→AFTER, user + timestamp; the clearing payment is
   flagged. Throwaway local Postgres, zero prod contact.
   Run: node scripts/_devverify.mjs scripts/verify-outstanding-audit.ts */
import { db } from "@/lib/db";
import { recordInvoicePayment } from "@/lib/b2b/invoices";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 8);

async function run() {
  const actor = await db.user.create({ data: { name: "Auditor", email: `audit-${rnd()}@test.local` }, select: { id: true } });
  const bizId = (await db.business.create({ data: { code: `AUB-${rnd()}`, name: "Audit Mess", type: "RESTAURANT", contactPerson: "T", mobile: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, line1: "1 Rd", pincode: "520001", paymentTerm: "CREDIT" } })).id;
  const order = await db.businessOrder.create({ data: { code: `AUO-${rnd()}`, businessId: bizId, status: "DELIVERED", deliveryDate: new Date(), deliveredAt: new Date(), deliveryTime: "6 AM", subtotalPaise: 2500000, taxPaise: 0, totalPaise: 2500000, paidPaise: 0, paymentTerm: "CREDIT", paymentStatus: "PENDING", revenuePaise: 2500000, items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 50, unit: "KG", unitPricePaise: 50000, lineTotalPaise: 2500000 }] } }, select: { id: true } });
  const inv = await db.businessInvoice.create({ data: { number: `DOODLY/B2B/2026/${rnd()}`, orderId: order.id, businessId: bizId, gstPaise: 0, status: "ISSUED", issuedAt: new Date() }, select: { id: true, number: true } });

  const A = { actorId: actor.id, actorRole: "super_admin" };
  await recordInvoicePayment(inv.id, { amountPaise: 1000000, method: "UPI", ...A });   // 25,000 → 15,000
  await recordInvoicePayment(inv.id, { amountPaise: 500000, method: "Cash", ...A });    // 15,000 → 10,000
  await recordInvoicePayment(inv.id, { amountPaise: 1000000, method: "Bank", ...A });   // 10,000 → 0 (cleared)

  const rows = await db.auditLog.findMany({ where: { action: { in: ["b2b.invoice.payment", "b2b.invoice.payment.cleared"] }, target: { contains: inv.number } }, orderBy: { createdAt: "asc" }, select: { action: true, target: true, userId: true, actorRole: true, createdAt: true } });
  ok("exactly 3 payment audit rows", rows.length === 3, String(rows.length));

  const r1 = rows[0], r2 = rows[1], r3 = rows[2];
  ok("row1: action=b2b.invoice.payment (partial)", r1?.action === "b2b.invoice.payment", r1?.action);
  ok("row1: amount ₹10,000 + outstanding 25,000→15,000 + method + business + invoice", !!r1 && r1.target!.includes("+₹10000.00") && r1.target!.includes("₹25000.00→₹15000.00") && r1.target!.includes("via UPI") && r1.target!.includes(bizId) && r1.target!.includes(inv.number), r1?.target ?? "");
  ok("row2: outstanding 15,000→10,000 (₹5,000 via Cash)", !!r2 && r2.action === "b2b.invoice.payment" && r2.target!.includes("+₹5000.00") && r2.target!.includes("₹15000.00→₹10000.00") && r2.target!.includes("via Cash"), r2?.target ?? "");
  ok("row3: action=cleared, outstanding 10,000→0, FULLY PAID", !!r3 && r3.action === "b2b.invoice.payment.cleared" && r3.target!.includes("+₹10000.00") && r3.target!.includes("₹10000.00→₹0.00") && r3.target!.includes("FULLY PAID"), r3?.target ?? "");
  ok("every row records the USER (real FK) + actorRole + timestamp", rows.every((r) => r.userId === actor.id && r.actorRole === "super_admin" && r.createdAt instanceof Date), JSON.stringify({ u: rows.map((r) => r.userId === actor.id), role: rows[0]?.actorRole }));

  // The append-only invoice event trail mirrors it (before→after note; last one CLEARED).
  const events = await db.businessInvoiceEvent.findMany({ where: { invoiceId: inv.id, type: "payment" }, orderBy: { createdAt: "asc" }, select: { note: true } });
  ok("3 invoice 'payment' events with before→after notes", events.length === 3 && events.every((e) => /outstanding ₹[\d.]+ ?→ ?₹[\d.]+/.test(e.note ?? "")), events.map((e) => e.note).join(" || "));
  ok("final invoice event flags CLEARED", (events.at(-1)?.note ?? "").includes("CLEARED"), events.at(-1)?.note ?? "");

  // Invoice is actually PAID + clearedAt persisted (ties the audit to real state).
  const finalInv = await db.businessInvoice.findUnique({ where: { id: inv.id }, select: { status: true, clearedAt: true } });
  ok("invoice ends PAID + clearedAt set", finalInv?.status === "PAID" && !!finalInv?.clearedAt, JSON.stringify({ s: finalInv?.status, c: !!finalInv?.clearedAt }));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Outstanding AUDIT-TRAIL E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
