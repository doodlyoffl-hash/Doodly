/* Generate a Tanker Closing Report PDF for a tanker WITH freshout, so we can confirm the
   freshout detail actually renders in the exported PDF (not just the JSON). No DB queries —
   builds from a literal recon. Run: node scripts/_devverify.mjs scripts/gen-freshout-pdf.ts */
import { writeFileSync } from "fs";
import { buildTankerReportTable } from "@/lib/milk/tanker-report";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { TankerRecon } from "@/lib/milk/reconcile";

const OUT = "C:\\Users\\devin\\AppData\\Local\\Temp\\claude\\C--Users-devin-OneDrive-Desktop-Doodly-Claude\\c991a164-a736-4095-b6ea-90103769989f\\scratchpad\\freshout_closing_report.pdf";

const recon: TankerRecon = {
  tanker: { id: "t1", code: "TNK-FRESHOUT", tankerNo: "FRT1", supplier: "FR SUPPLIER", procurementDate: "2100-01-01", quantityKg: 1920, fatPct: 6.2, litres: 1920, freshoutKg: 40, freshoutLitres: 40, consumedLitres: 1960, remainingLitres: 0, costPerLitrePaise: 4898, milkCostPaise: 9600000, fatCostPaise: 0, transportPaise: 0, totalCostPaise: 9600000, status: "CLOSED", closedAt: null },
  retail: { customers: 0, deliveries: 0, litres: 0, revenuePaise: 0, lines: [] },
  b2b: {
    businesses: 1, deliveries: 3, litres: 1960, revenuePaise: 12936000,
    lines: [
      { channel: "B2B", date: "2100-01-01", name: "Freshout Biz", refId: "b1", orderId: "o1", orderCode: "FRO-A", subscriptionId: null, invoiceNumber: null, product: "Buffalo Milk", qty: "1920 Litres", unit: "Litres", litres: 1920, sellingPricePaise: 6600, revenuePaise: 12672000, costPaise: 9404160, exec: null },
      { channel: "B2B", date: "2100-01-02", name: "Freshout Biz", refId: "b1", orderId: "o2", orderCode: "FRO-B", subscriptionId: null, invoiceNumber: null, product: "Buffalo Milk", qty: "30 Litres", unit: "Litres", litres: 30, sellingPricePaise: 6600, revenuePaise: 198000, costPaise: 146940, exec: null },
      { channel: "B2B", date: "2100-01-03", name: "Freshout Biz", refId: "b1", orderId: "o3", orderCode: "FRO-C", subscriptionId: null, invoiceNumber: null, product: "Buffalo Milk", qty: "10 Litres", unit: "Litres", litres: 10, sellingPricePaise: 6600, revenuePaise: 66000, costPaise: 48980, exec: null },
    ],
  },
  usage: { openingLitres: 1920, freshoutLitres: 40, totalAvailableLitres: 1960, retailLitres: 0, b2bLitres: 1960, wastageLitres: 0, carryForwardInLitres: 0, carryForwardOutLitres: 0, availableAfterCarryForward: 1960, carryForwardLitres: 0, closingLitres: 0 },
  financial: { retailRevenuePaise: 0, b2bRevenuePaise: 12936000, totalRevenuePaise: 12936000, procurementCostPaise: 9600000, transportPaise: 0, totalCostPaise: 9600000, cogsPaise: 9600080, grossProfitPaise: 3335920, netProfitPaise: 3335920 },
  reconciled: true,
};

async function main() {
  const report = buildTankerReportTable(recon);
  console.log("SUBTITLE_LEN:", report.subtitle.length);
  console.log("SUBTITLE:", report.subtitle);
  console.log("SUBTITLE_HAS_FRESHOUT:", /freshout/i.test(report.subtitle));
  const { bytes } = await renderMilkReportPdf(report);
  writeFileSync(OUT, bytes);
  console.log("PDF_BYTES:", bytes.length, "PATH:", OUT);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
