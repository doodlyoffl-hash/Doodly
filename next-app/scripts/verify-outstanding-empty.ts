/* Edge case — the Outstanding ledger for a business with NO invoices (and a non-existent one).
   Every engine + report path must return sensible EMPTY results (zeros / empty arrays), never throw,
   and the report PDFs must still render. Throwaway local Postgres, zero prod contact.
   Run: node scripts/_devverify.mjs scripts/verify-outstanding-empty.ts */
import { db } from "@/lib/db";
import { computeLedger, outstandingSummary, businessLedger, paymentHistory, collectionReport, outstandingReport, businessLedgerReport, agingReport } from "@/lib/b2b/outstanding";
import { milkReportCsv } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 8);

async function run() {
  // A registered business that has never been invoiced.
  const bizId = (await db.business.create({ data: { code: `EMB-${rnd()}`, name: "Empty Mess", type: "RESTAURANT", contactPerson: "T", mobile: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, line1: "1 Rd", pincode: "520001", paymentTerm: "CREDIT" } })).id;

  // ---- engine paths ----
  const led = await computeLedger({ businessId: bizId });
  ok("computeLedger → empty rows, no throw", Array.isArray(led.rows) && led.rows.length === 0 && led.asOf instanceof Date, String(led.rows.length));
  const sum = await outstandingSummary({ businessId: bizId });
  ok("outstandingSummary → all zeros (count/value/outstanding/overdue/avg)", sum.invoiceCount === 0 && sum.invoiceTotalPaise === 0 && sum.outstandingAsOfPaise === 0 && sum.overdueAmountPaise === 0 && sum.avgCollectionDays === 0 && sum.fullyPaid === 0 && sum.partiallyPaid === 0 && sum.unpaid === 0, JSON.stringify(sum).slice(0, 120));
  ok("summary aging → 6 buckets all zero", sum.aging.length === 6 && sum.aging.every((b) => b.count === 0 && b.amountPaise === 0), sum.aging.map((b) => b.count).join(","));
  const bl = await businessLedger(bizId);
  ok("businessLedger → no entries, closing balance 0, business name present", bl.lines.length === 0 && bl.closingBalancePaise === 0 && (bl.business as { name?: string }).name === "Empty Mess", JSON.stringify({ n: bl.lines.length, bal: bl.closingBalancePaise }));
  const hist = await paymentHistory({ businessId: bizId });
  ok("paymentHistory → empty array", Array.isArray(hist) && hist.length === 0, String(hist.length));
  const coll = await collectionReport({ businessId: bizId, from: "2026-01-01", to: "2026-12-31" });
  ok("collectionReport → 0 collected, 0 payments, no businesses", coll.totalCollectedPaise === 0 && coll.paymentCount === 0 && coll.byBusiness.length === 0, JSON.stringify(coll));

  // ---- report builders + renderers (must not crash on empty) ----
  const outRep = await outstandingReport({ businessId: bizId });
  ok("outstandingReport → 0 rows, TOTAL shows ₹0", outRep.rowCount === 0 && outRep.totalRow?.[5] === "₹0", JSON.stringify(outRep.totalRow));
  const outPdf = await renderMilkReportPdf(outRep);
  ok("empty outstanding PDF renders (valid bytes)", outPdf.bytes.length > 800, String(outPdf.bytes.length));
  ok("empty outstanding CSV renders (header + total row)", milkReportCsv(outRep).includes("Outstanding") && milkReportCsv(outRep).includes("TOTAL"), "ok");
  const ageRep = await agingReport({ businessId: bizId });
  ok("agingReport → 6 zero buckets, TOTAL ₹0, PDF renders", ageRep.rowCount === 6 && ageRep.totalRow?.[2] === "₹0" && (await renderMilkReportPdf(ageRep)).bytes.length > 800, JSON.stringify(ageRep.totalRow));
  const blRep = await businessLedgerReport(bizId);
  ok("businessLedgerReport → 0 rows, closing ₹0, title has business name, PDF renders", blRep.rowCount === 0 && blRep.totalRow?.[6] === "₹0" && blRep.title.includes("Empty Mess") && (await renderMilkReportPdf(blRep)).bytes.length > 800, blRep.title);

  // ---- defensive: a non-existent businessId ----
  const ghost = await businessLedger("does-not-exist-" + rnd());
  ok("businessLedger(non-existent id) → no throw, empty, balance 0", ghost.lines.length === 0 && ghost.closingBalancePaise === 0, JSON.stringify({ n: ghost.lines.length }));
  const ghostRep = await businessLedgerReport("does-not-exist-" + rnd());
  ok("businessLedgerReport(non-existent id) → builds + PDF renders (falls back to id in title)", ghostRep.rowCount === 0 && (await renderMilkReportPdf(ghostRep)).bytes.length > 800, ghostRep.title.slice(0, 40));
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Outstanding EMPTY-BUSINESS edge-case E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
