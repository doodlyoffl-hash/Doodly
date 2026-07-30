/* GET /api/admin/geo-corrections/export?kind=customers|executives|areas&format=pdf|xls|csv|json&from=&to=
   The GPS Corrections report: per-customer (pin moves), per-executive (who corrected),
   or per-area (frequently corrected PIN codes). RBAC geoCorrection:export. Every download
   is audited. Renders through the shared report PDF. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { geoCorrectionsReport, geoReportCsv, geoReportXls, geoReportFilename, type GeoReportKind } from "@/lib/ops/geo-corrections-report";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { requirePermission(req, "geoCorrection", "export"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const kind = (["customers", "executives", "areas"].includes(sp.get("kind") || "") ? sp.get("kind") : "customers") as GeoReportKind;
  const format = (sp.get("format") || "pdf").toLowerCase();
  const from = sp.get("from"), to = sp.get("to");

  const log = (fmt: string, n: number) =>
    audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "geo.corrections.export", target: `${kind} · ${fmt.toUpperCase()} · ${n} correction(s)`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await geoCorrectionsReport(kind, { from, to });
    if (format === "json") { await log("json", report.totals.corrections); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
      await log("pdf", report.totals.corrections);
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${geoReportFilename(kind, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls", report.totals.corrections);
      return new NextResponse(geoReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${geoReportFilename(kind, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv", report.totals.corrections);
      return new NextResponse(geoReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${geoReportFilename(kind, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("geo-corrections.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the GPS corrections report." }, { status: 500 });
  }
}
