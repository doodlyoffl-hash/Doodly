/* Verify the Outstanding-ledger REPORT exports (Step 10) — every report type builds correctly and
   PDF/Excel/CSV/View all carry identical figures. Throwaway local Postgres, zero prod contact.
   Seeds a known scenario, builds each MilkReport, checks structure + CSV parity, and writes PDFs
   for text extraction. Run: node scripts/_devverify.mjs scripts/verify-outstanding-reports.ts */
import { writeFileSync } from "fs";
import { db } from "@/lib/db";
import { recordInvoicePayment } from "@/lib/b2b/invoices";
import { outstandingReport, agingReport, collectionReportTable, paymentHistoryReport, businessLedgerReport } from "@/lib/b2b/outstanding";
import { milkReportCsv, milkReportXls, type MilkReport } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

const OUT = "C:\\Users\\devin\\AppData\\Local\\Temp\\claude\\C--Users-devin-OneDrive-Desktop-Doodly-Claude\\c991a164-a736-4095-b6ea-90103769989f\\scratchpad\\";
const R: { name: string; pass: boolean; detail?: string }[] = [];
const ok = (n: string, c: boolean, d?: string) => R.push({ name: n, pass: !!c, detail: d });
const rnd = () => Math.random().toString(36).slice(2, 8);
let seq = 0;
const invNo = () => `DOODLY/B2B/2026/${String(++seq).padStart(5, "0")}`;

async function mkBiz(name: string) {
  return (await db.business.create({ data: { code: `ORB-${rnd()}`, name, type: "RESTAURANT", contactPerson: "T", mobile: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, line1: "1 Rd", pincode: "520001", gst: "36ABCDE1234F1Z5", paymentTerm: "CREDIT" } })).id;
}
async function mkInvoice(bizId: string, totalPaise: number, issuedIso: string, dueIso?: string) {
  const issuedAt = new Date(`${issuedIso}T10:00:00`);
  const order = await db.businessOrder.create({ data: { code: `ORO-${rnd()}`, businessId: bizId, status: "DELIVERED", deliveryDate: issuedAt, deliveredAt: issuedAt, deliveryTime: "6 AM", subtotalPaise: totalPaise, taxPaise: 0, totalPaise, paidPaise: 0, paymentTerm: "CREDIT", paymentStatus: "PENDING", revenuePaise: totalPaise, items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 50, unit: "KG", unitPricePaise: Math.round(totalPaise / 50), lineTotalPaise: totalPaise }] } }, select: { id: true } });
  const inv = await db.businessInvoice.create({ data: { number: invNo(), orderId: order.id, businessId: bizId, gstPaise: 0, status: "ISSUED", issuedAt, dueDate: dueIso ? new Date(`${dueIso}T10:00:00`) : null }, select: { id: true } });
  return inv.id;
}
const pay = (invId: string, amt: number, iso: string) => recordInvoicePayment(invId, { amountPaise: amt, method: "Cash", paidAt: iso, actorRole: "system" });

async function renderAll(tag: string, rep: MilkReport) {
  const csv = milkReportCsv(rep);
  const xls = milkReportXls(rep);
  const { bytes } = await renderMilkReportPdf(rep);
  writeFileSync(`${OUT}outreport_${tag}.pdf`, bytes);
  writeFileSync(`${OUT}outreport_${tag}.csv`, csv);
  return { csv, xls, pdfBytes: bytes.length };
}

async function run() {
  // bizA: ₹30,000 fully paid (₹10k + ₹20k, both dated in the past so they count as-of-now).
  // bizB: ₹20,000 issued 01 Jul, ₹5k (05 Jul) + ₹10k (20 Jul) → ₹5,000 still outstanding (due 10 Jul).
  const bizA = await mkBiz("Alpha Foods");
  const invA = await mkInvoice(bizA, 3000000, "2026-07-25", "2026-07-30");
  await pay(invA, 1000000, "2026-07-26"); await pay(invA, 2000000, "2026-07-28");
  const bizB = await mkBiz("Beta Caterers");
  const invB = await mkInvoice(bizB, 2000000, "2026-07-01", "2026-07-10");
  await pay(invB, 500000, "2026-07-05"); await pay(invB, 1000000, "2026-07-20");

  // ---- Outstanding report (default owing-only) ----
  const outRep = await outstandingReport({});
  const outX = await renderAll("outstanding", outRep);
  ok("Outstanding: 10 columns + TOTAL row", outRep.columns.length === 10 && outRep.totalRow?.[0] === "TOTAL", JSON.stringify({ c: outRep.columns.length }));
  ok("Outstanding: only the ₹5,000 owing invoice (bizA cleared → excluded)", outRep.rowCount === 1 && outRep.rows[0][5] === "₹5,000", JSON.stringify(outRep.rows[0]));
  ok("Outstanding: TOTAL outstanding = ₹5,000", outRep.totalRow?.[5] === "₹5,000", String(outRep.totalRow?.[5]));
  ok("Outstanding CSV parity: contains the row + ₹5,000 total", outX.csv.includes("₹5,000") && outX.csv.includes("Beta Caterers"), "csvlen=" + outX.csv.length);
  ok("Outstanding PDF + XLS non-empty", outX.pdfBytes > 800 && outX.xls.length > 200, JSON.stringify({ pdf: outX.pdfBytes, xls: outX.xls.length }));

  // ---- Aging report ----
  const ageRep = await agingReport({});
  const ageX = await renderAll("aging", ageRep);
  ok("Aging: 6 buckets + TOTAL, total outstanding ₹5,000", ageRep.rowCount === 6 && ageRep.totalRow?.[2] === "₹5,000", JSON.stringify({ n: ageRep.rowCount, t: ageRep.totalRow?.[2] }));
  ok("Aging: the ₹5,000 sits in the 31-60 bucket (issued 01 Jul)", ageRep.rows.some((r) => r[0] === "31-60 days" && r[2] === "₹5,000"), JSON.stringify(ageRep.rows.map((r) => r[0] + ":" + r[2])));
  ok("Aging CSV parity", ageX.csv.includes("31-60") && ageX.csv.includes("₹5,000"), "ok");

  // ---- Collection report (Jul–Aug: all 4 payments = ₹45,000) ----
  const collRep = await collectionReportTable({ from: "2026-07-01", to: "2026-08-31" });
  const collX = await renderAll("collection", collRep);
  ok("Collection: 2 businesses + TOTAL ₹45,000 collected", collRep.rowCount === 2 && collRep.totalRow?.[2] === "₹45,000", JSON.stringify({ n: collRep.rowCount, t: collRep.totalRow?.[2] }));
  ok("Collection CSV parity: both businesses present", collX.csv.includes("Alpha Foods") && collX.csv.includes("Beta Caterers"), "ok");

  // ---- Payment history (all 4 payments) ----
  const payRep = await paymentHistoryReport({});
  const payX = await renderAll("payments", payRep);
  ok("Payments: 4 rows + TOTAL ₹45,000", payRep.rowCount === 4 && payRep.totalRow?.[5] === "₹45,000", JSON.stringify({ n: payRep.rowCount, t: payRep.totalRow?.[5] }));
  ok("Payments CSV parity: has ₹20,000 + ₹10,000 + ₹5,000 lines", payX.csv.includes("₹20,000") && payX.csv.includes("₹10,000") && payX.csv.includes("₹5,000"), "ok");

  // ---- Business ledger (bizB): 20k − 5k − 10k = 5k ----
  const blRep = await businessLedgerReport(bizB, {});
  const blX = await renderAll("business-ledger", blRep);
  ok("Business ledger: 3 rows + closing balance ₹5,000", blRep.rowCount === 3 && blRep.totalRow?.[6] === "₹5,000", JSON.stringify({ n: blRep.rowCount, t: blRep.totalRow?.[6] }));
  ok("Business ledger: running balance 20k → 15k → 5k", blRep.rows[0][6] === "₹20,000" && blRep.rows[1][6] === "₹15,000" && blRep.rows[2][6] === "₹5,000", JSON.stringify(blRep.rows.map((r) => r[6])));
  ok("Business ledger CSV parity", blX.csv.includes("₹20,000") && blX.csv.includes("₹5,000"), "ok");
  void invB;
}

run()
  .catch((e) => ok("run threw", false, (e as Error).stack || (e as Error).message))
  .finally(async () => {
    await db.$disconnect();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n=== Outstanding REPORT exports E2E (local dev DB) — ${pass}/${R.length} passed ===`);
    for (const r of R) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    process.exit(pass === R.length ? 0 : 1);
  });
