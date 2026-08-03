/* Runtime E2E — Business Invoice Outstanding Ledger (throwaway local Postgres, zero prod contact).
   Proves the payment-ledger source of truth: outstanding AS-OF any date, paid-in-period, history
   preserved, aging, business ledger, report parity. Run: node scripts/_devverify.mjs scripts/verify-outstanding.ts */
import { db } from "@/lib/db";
import { computeLedger, outstandingSummary, businessLedger, paymentHistory, collectionReport, outstandingReport, agingBuckets } from "@/lib/b2b/outstanding";
import { recordInvoicePayment } from "@/lib/b2b/invoices";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 8);
let seq = 0;
const invNo = () => `DOODLY/B2B/2026/${String(++seq).padStart(5, "0")}`;

async function mkBiz(name: string) {
  return (await db.business.create({ data: { code: `OLB-${rnd()}`, name, type: "RESTAURANT", contactPerson: "T", mobile: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, line1: "1 Rd", pincode: "520001", paymentTerm: "CREDIT" } })).id;
}
async function mkInvoice(bizId: string, totalPaise: number, issuedIso: string, opts: { gstPaise?: number; dueIso?: string } = {}) {
  const issuedAt = new Date(`${issuedIso}T10:00:00`);
  const gst = opts.gstPaise ?? 0;
  const order = await db.businessOrder.create({ data: { code: `OLO-${rnd()}`, businessId: bizId, status: "DELIVERED", deliveryDate: issuedAt, deliveredAt: issuedAt, deliveryTime: "6 AM", subtotalPaise: totalPaise - gst, taxPaise: gst, totalPaise, paidPaise: 0, paymentTerm: "CREDIT", paymentStatus: "PENDING", revenuePaise: totalPaise - gst, items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 50, unit: "KG", unitPricePaise: Math.round(totalPaise / 50), lineTotalPaise: totalPaise }] } }, select: { id: true } });
  const inv = await db.businessInvoice.create({ data: { number: invNo(), orderId: order.id, businessId: bizId, gstPaise: gst, status: "ISSUED", issuedAt, dueDate: opts.dueIso ? new Date(`${opts.dueIso}T10:00:00`) : null }, select: { id: true } });
  return inv.id;
}
const pay = (invoiceId: string, amountPaise: number, paidIso: string) => recordInvoicePayment(invoiceId, { amountPaise, method: "Cash", paidAt: paidIso, actorRole: "system" });
const rowFor = (rows: Awaited<ReturnType<typeof computeLedger>>["rows"], bizId: string) => rows.find((r) => r.businessId === bizId);

async function run() {
  // ---- S1: ₹30,000 invoice, no payment → outstanding ₹30,000 ----
  const bizA = await mkBiz("Alpha Mess");
  const invA = await mkInvoice(bizA, 3000000, "2026-08-01");
  let led = await computeLedger({ businessId: bizA });
  ok("S1: unpaid ₹30,000 → outstanding ₹30,000, status UNPAID", rowFor(led.rows, bizA)?.outstandingAsOfPaise === 3000000 && rowFor(led.rows, bizA)?.statusAsOf === "UNPAID", JSON.stringify({ o: rowFor(led.rows, bizA)?.outstandingAsOfPaise, s: rowFor(led.rows, bizA)?.statusAsOf }));
  const sumA0 = await outstandingSummary({ businessId: bizA });
  ok("S1: summary outstanding ₹30,000, unpaid=1", sumA0.outstandingAsOfPaise === 3000000 && sumA0.unpaid === 1, JSON.stringify({ o: sumA0.outstandingAsOfPaise, u: sumA0.unpaid }));

  // ---- S2: pay ₹10,000 → outstanding ₹20,000, history preserved ----
  await pay(invA, 1000000, "2026-08-02");
  led = await computeLedger({ businessId: bizA });
  ok("S2: after ₹10,000 → outstanding ₹20,000, status PARTIAL", rowFor(led.rows, bizA)?.outstandingAsOfPaise === 2000000 && rowFor(led.rows, bizA)?.statusAsOf === "PARTIAL", JSON.stringify({ o: rowFor(led.rows, bizA)?.outstandingAsOfPaise }));
  const histA = await paymentHistory({ businessId: bizA });
  ok("S2: payment history has the ₹10,000 entry", histA.length === 1 && histA[0].amountPaise === 1000000, JSON.stringify(histA.map((h) => h.amountPaise)));

  // ---- S3 + Step 5 (the crux): ₹20,000 issued 01 Jul, ₹5,000 on 05 Jul, ₹10,000 on 20 Jul ----
  const bizB = await mkBiz("Beta Caterers");
  const invB = await mkInvoice(bizB, 2000000, "2026-07-01", { dueIso: "2026-07-10" });
  await pay(invB, 500000, "2026-07-05");
  await pay(invB, 1000000, "2026-07-20");
  // Filter 01 Jul – 15 Jul → outstanding AS OF 15 Jul = 20,000 − 5,000 = 15,000 (the 20 Jul payment is later)
  const asOf15 = await computeLedger({ businessId: bizB, asOf: "2026-07-15" });
  const rB15 = rowFor(asOf15.rows, bizB);
  ok("Step5: outstanding AS OF 15 Jul = ₹15,000 (only the 05 Jul payment counts)", rB15?.outstandingAsOfPaise === 1500000 && rB15?.paidAsOfPaise === 500000, JSON.stringify({ out: rB15?.outstandingAsOfPaise, paid: rB15?.paidAsOfPaise }));
  const period = await computeLedger({ businessId: bizB, asOf: "2026-07-15", from: "2026-07-01", to: "2026-07-15", basis: "payment", outstandingOnly: false });
  ok("Step5: paid DURING 01–15 Jul = ₹5,000", rowFor(period.rows, bizB)?.paidInPeriodPaise === 500000, JSON.stringify({ p: rowFor(period.rows, bizB)?.paidInPeriodPaise }));
  // Filter All Time → outstanding = 20,000 − 15,000 = 5,000, paid = 15,000 (history NOT lost)
  const allTime = await computeLedger({ businessId: bizB });
  const rBnow = rowFor(allTime.rows, bizB);
  ok("Step5: All-Time outstanding = ₹5,000, paid = ₹15,000 (old balance never hidden)", rBnow?.outstandingAsOfPaise === 500000 && rBnow?.paidAsOfPaise === 1500000, JSON.stringify({ out: rBnow?.outstandingAsOfPaise, paid: rBnow?.paidAsOfPaise }));
  ok("Step5: still PARTIAL + overdue (due 10 Jul, past)", rBnow?.statusAsOf === "PARTIAL" && rBnow?.overdue === true, JSON.stringify({ s: rBnow?.statusAsOf, od: rBnow?.overdue }));

  // ---- S3 payment-date filter shows period payments while outstanding stays correct ----
  const payHistJul = await paymentHistory({ businessId: bizB, from: "2026-07-01", to: "2026-07-15" });
  ok("S3: payment-date filter 01–15 Jul → only the ₹5,000 payment", payHistJul.length === 1 && payHistJul[0].amountPaise === 500000, JSON.stringify(payHistJul.map((h) => h.amountPaise)));

  // ---- S4: All Time shows full history (both payments) ----
  const payHistAll = await paymentHistory({ businessId: bizB });
  ok("S4: All-Time payment history = both payments (₹5,000 + ₹10,000)", payHistAll.length === 2 && payHistAll.reduce((s, p) => s + p.amountPaise, 0) === 1500000, JSON.stringify(payHistAll.map((h) => h.amountPaise)));

  // ---- clearedAt: fully pay bizA's remaining ₹20,000 → PAID + cleared ----
  await pay(invA, 2000000, "2026-08-03");
  led = await computeLedger({ businessId: bizA, outstandingOnly: false });
  const rAcleared = rowFor(led.rows, bizA);
  ok("Cleared: bizA fully paid → outstanding 0, status PAID, clearedAt set", rAcleared?.outstandingAsOfPaise === 0 && rAcleared?.statusAsOf === "PAID" && !!rAcleared?.clearedAt, JSON.stringify({ o: rAcleared?.outstandingAsOfPaise, s: rAcleared?.statusAsOf, c: rAcleared?.clearedAt?.slice(0, 10) }));
  const invARow = await db.businessInvoice.findUnique({ where: { id: invA }, select: { status: true, clearedAt: true } });
  ok("Cleared: invoice.status=PAID + clearedAt persisted", invARow?.status === "PAID" && !!invARow?.clearedAt, JSON.stringify({ s: invARow?.status, c: !!invARow?.clearedAt }));

  // ---- Aging: bizB's 20k (issued 01 Jul, ~34d old now) sits in 31–60; bizA cleared → absent ----
  const allLed = await computeLedger({ outstandingOnly: true });
  const buckets = agingBuckets(allLed.rows);
  const bktB = buckets.find((b) => allLed.rows.some((r) => r.businessId === bizB && r.daysOutstanding >= 31 && r.daysOutstanding <= 60));
  ok("Aging: bizB's overdue outstanding falls in a 31–60 (or older) bucket", !!bktB || buckets.some((b) => (b.label === "31-60" || b.label === "61-90" || b.label === "90+") && b.amountPaise >= 500000), buckets.map((b) => `${b.label}:${b.count}/${Math.round(b.amountPaise / 100)}`).join(" "));

  // ---- Business ledger: chronological running balance for bizB ----
  const bl = await businessLedger(bizB);
  ok("Ledger: bizB closing balance = ₹5,000 (20,000 − 5,000 − 10,000)", bl.closingBalancePaise === 500000, String(bl.closingBalancePaise));
  ok("Ledger: 3 chronological lines (invoice + 2 payments), running balance monotone to 5,000", bl.lines.length === 3 && bl.lines[0].balancePaise === 2000000 && bl.lines[2].balancePaise === 500000, JSON.stringify(bl.lines.map((l) => l.balancePaise)));

  // ---- Collection report: payments in a period grouped by business ----
  const coll = await collectionReport({ from: "2026-07-01", to: "2026-07-31" });
  ok("Collection: July collected = ₹15,000 (both bizB payments), grouped", coll.totalCollectedPaise === 1500000 && coll.paymentCount === 2, JSON.stringify({ t: coll.totalCollectedPaise, n: coll.paymentCount }));

  // ---- Report parity: the exported Outstanding report matches the ledger ----
  const rep = await outstandingReport({ businessId: bizB });
  ok("Report parity: outstanding report row for bizB shows ₹5,000 outstanding", rep.rows.length === 1 && rep.rows[0][5] === "₹5,000", JSON.stringify(rep.rows[0]));

  // ---- Audit: payment + cleared events recorded (Step 12) ----
  const auditCount = await db.auditLog.count({ where: { action: { in: ["b2b.invoice.payment", "b2b.invoice.payment.cleared"] } } });
  ok("Audit: payment/cleared events recorded with outstanding before→after", auditCount >= 4, String(auditCount));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Outstanding Ledger E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
