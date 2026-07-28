/* GET /api/admin/deliveries/route-report/export?date=YYYY-MM-DD&format=pdf|xls|csv|json
   The per-executive route report for an IST delivery day (default today): each
   executive's optimised round-trip — planned distance + est. travel time, stops
   run, completed / missed, and distance so far. RBAC deliveries:export.
   Every download is audited (Step 13). Renders through the shared report PDF. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { routeReport, routeReportCsv, routeReportXls, routeReportFilename } from "@/lib/ops/route-report";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { requirePermission(req, "deliveries", "export"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const format = (sp.get("format") || "pdf").toLowerCase();

  const log = (fmt: string, day: string, execs: number) =>
    audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "ops.routeReport.export", target: `${day} · ${fmt.toUpperCase()} · ${execs} exec(s)`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await routeReport(date);
    if (format === "json") { await log("json", report.date, report.totals.executives); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      // The shared renderer reads only title/subtitle/columns/rows/totalRow — the report is shaped to match.
      const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
      await log("pdf", report.date, report.totals.executives);
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${routeReportFilename(report.date, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls", report.date, report.totals.executives);
      return new NextResponse(routeReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${routeReportFilename(report.date, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv", report.date, report.totals.executives);
      return new NextResponse(routeReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${routeReportFilename(report.date, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("route-report.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the route report." }, { status: 500 });
  }
}
