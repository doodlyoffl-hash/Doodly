/* Generate the B2B Invoice REGISTER PDF (the filtered export) on a throwaway DB so we can
   extract its text and confirm what it contains. Freshout is milk-tanker data and must NOT
   appear here — this proves the register is invoice-only and renders cleanly with the
   subtitle-wrap fix. Run: node scripts/_devverify.mjs scripts/gen-b2b-invoice-pdf.ts */
import { writeFileSync } from "fs";
import { db } from "@/lib/db";
import { updateOrderStatus } from "@/lib/b2b/service";
import { b2bInvoicesReport } from "@/lib/b2b/invoices";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

const OUT = "C:\\Users\\devin\\AppData\\Local\\Temp\\claude\\C--Users-devin-OneDrive-Desktop-Doodly-Claude\\c991a164-a736-4095-b6ea-90103769989f\\scratchpad\\b2b_invoice_register.pdf";
const rnd = () => Math.random().toString(36).slice(2, 8);

async function main() {
  const bizId = (await db.business.create({ data: { code: `B-${rnd()}`, name: "Sri Sai Mess", type: "RESTAURANT", contactPerson: "Ravi", mobile: "9876543210", email: "mess@test.local", line1: "1 Rd", pincode: "520001", gst: "36ABCDE1234F1Z5", paymentTerm: "CASH" } })).id;
  // two delivered orders → each auto-generates an invoice on the DELIVERED path
  for (const [tag, total, tax] of [["A", 500000, 25000], ["B", 320000, 16000]] as const) {
    const oid = (await db.businessOrder.create({
      data: { code: `ORD-${tag}-${rnd()}`, businessId: bizId, status: "OUT_FOR_DELIVERY", deliveryDate: new Date(), deliveryTime: "6 AM", subtotalPaise: total - tax, taxPaise: tax, totalPaise: total, paidPaise: 0, paymentTerm: "CASH", paymentStatus: "PENDING", items: { create: [{ productSlug: "milk", productName: "Buffalo Milk", quantity: 50, unit: "KG", unitPricePaise: Math.round(total / 50), lineTotalPaise: total }] } },
      select: { id: true },
    })).id;
    await updateOrderStatus({ id: oid, status: "DELIVERED", actorRole: "system" });
  }

  const report = await b2bInvoicesReport({}, { subtitle: "All invoices" });
  console.log("TITLE:", report.title);
  console.log("COLUMNS:", report.columns.map((c) => c.label).join(" | "));
  console.log("SUBTITLE:", report.subtitle);
  console.log("ROWCOUNT:", report.rowCount);
  console.log("HAS_FRESHOUT_IN_REPORT:", /freshout/i.test(JSON.stringify(report)));
  const { bytes } = await renderMilkReportPdf(report);
  writeFileSync(OUT, bytes);
  console.log("PDF_BYTES:", bytes.length, "PATH:", OUT);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
