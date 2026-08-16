/* GET /api/admin/deliveries/gps-distance/export?date=YYYY-MM-DD&format=pdf|xls|csv|json
   The per-executive GPS travel-distance report for an IST delivery day (default
   today): each executive's ACTUAL (GPS, fraud-filtered) km vs the planned optimised
   round-trip, deliveries, avg km/delivery, avg speed and hours worked. RBAC
   deliveries:export. Every download is audited. Renders through the shared PDF. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { gpsDistanceReport, gpsDistanceReportCsv, gpsDistanceReportXls, gpsDistanceReportFilename } from "@/lib/ops/gps-distance-report";
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
    audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "ops.gpsDistanceReport.export", target: `${day} · ${fmt.toUpperCase()} · ${execs} exec(s)`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await gpsDistanceReport(date);
    if (format === "json") { await log("json", report.date, report.totals.executives); await audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "deliveries.report.view", target: `gps-distance · ${report.date} · ${report.totals.executives} exec(s)`, ctx: reqContext(req) }).catch(() => {}); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      // The shared renderer reads only title/subtitle/columns/rows/totalRow — the report is shaped to match.
      const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
      await log("pdf", report.date, report.totals.executives);
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${gpsDistanceReportFilename(report.date, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls", report.date, report.totals.executives);
      return new NextResponse(gpsDistanceReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${gpsDistanceReportFilename(report.date, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv", report.date, report.totals.executives);
      return new NextResponse(gpsDistanceReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${gpsDistanceReportFilename(report.date, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("gps-distance.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the GPS distance report." }, { status: 500 });
  }
}
