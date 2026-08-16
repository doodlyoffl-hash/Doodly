/* /api/admin/milk/inventory — milk inventory, DERIVED from tanker procurement (single source
   of truth). procurement:view.
     (default)            → live FIFO inventory (open lots + remaining + valuation)
     ?view=summary&date=  → Inventory Dashboard for a day (opening/proc/freshout/retail/b2b/wastage/closing)
     ?view=ledger&from=&to= → Inventory Ledger (every movement + running balance)
     &format=pdf|xls|csv  → export the ledger / daily-stock report (respects the filters) */
import { NextRequest, NextResponse } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getInventory } from "@/lib/milk/tanker";
import { milkInventoryLedger, milkInventorySummary, milkInventoryLedgerReport, milkDailyStockReport } from "@/lib/milk/inventory";
import { milkReportCsv, milkReportXls, milkReportFilename, type MilkReport } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { readUserId } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.inventory", async (req: NextRequest) => {
  const role = requirePermission(req, "procurement", "view");
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "";
  const from = sp.get("from") ?? undefined, to = sp.get("to") ?? undefined, date = sp.get("date") ?? undefined;
  const format = (sp.get("format") ?? "").toLowerCase();

  if (format === "json") {
    // in-site Report Viewer — the SAME MilkReport the file exports render, so View == CSV/PDF/Excel
    const report: MilkReport = view === "summary" || view === "dashboard" ? await milkDailyStockReport(date) : await milkInventoryLedgerReport({ from, to });
    await audit({ userId: readUserId(req) ?? null, actorRole: role, action: "milk.inventory.view", target: `${view || "ledger"} · ${report.rowCount} row(s)`, ctx: reqContext(req) }).catch(() => {});
    return NextResponse.json(report);
  }
  if (format === "pdf" || format === "xls" || format === "csv") {
    const report: MilkReport = view === "summary" || view === "dashboard" ? await milkDailyStockReport(date) : await milkInventoryLedgerReport({ from, to });
    await audit({ userId: readUserId(req) ?? null, actorRole: role, action: "milk.inventory.export", target: `${view || "ledger"} · ${format.toUpperCase()} · ${report.rowCount} row(s)`, ctx: reqContext(req) }).catch(() => {});
    if (format === "csv") return new NextResponse(milkReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "csv")}"`, "Cache-Control": "no-store" } });
    if (format === "xls") return new NextResponse(milkReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "xls")}"`, "Cache-Control": "no-store" } });
    const { bytes } = await renderMilkReportPdf(report);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${milkReportFilename(report, "pdf")}"`, "Cache-Control": "no-store" } });
  }

  if (view === "ledger") return ok(await milkInventoryLedger({ from, to }));
  if (view === "summary" || view === "dashboard") return ok(await milkInventorySummary(date));
  return ok(await getInventory());
});
