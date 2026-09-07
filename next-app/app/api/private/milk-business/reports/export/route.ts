/* GET /api/private/milk-business/reports/export?type=&format=json|pdf|xls|csv&from=&to=
   Private-module reports — one dataset drives View(json)/PDF/Excel/CSV/Print (spec §35).
   Gated server-side on the milkBusiness RBAC module. Every view/export audited. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness, actorId, actorRole } from "@/lib/milk-business/guard";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { milkReportCsv, milkReportXls, milkReportFilename } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import { buildMbReport, MB_REPORT_TYPES, type MbReportType } from "@/lib/milk-business/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthBounds(): { from: string; to: string } {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth();
  return { from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "private-pnl").toLowerCase();
  if (!MB_REPORT_TYPES.includes(type as MbReportType)) return NextResponse.json({ error: "unknown report type" }, { status: 400 });
  const format = (sp.get("format") || "json").toLowerCase();
  const def = monthBounds();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") || "") ? sp.get("from")! : def.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") || "") ? sp.get("to")! : def.to;

  try {
    const report = await buildMbReport(type as MbReportType, from, to);
    const uid = actorId(req) ?? null, role = actorRole(req), ctx = reqContext(req);
    const log = (fmt: string, action: string) => audit({ userId: uid, actorRole: role, action, target: `${type} · ${fmt.toUpperCase()} · ${from}→${to} · ${report.rowCount} row(s)`, ctx }).catch(() => {});

    if (format === "json") { await log("json", "milkBusiness.report.view"); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      const { bytes, filename } = await renderMilkReportPdf(report);
      await log("pdf", "milkBusiness.report.export");
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") { await log("xls", "milkBusiness.report.export"); return new NextResponse(milkReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "xls")}"`, "Cache-Control": "no-store" } }); }
    if (format === "csv") { await log("csv", "milkBusiness.report.export"); return new NextResponse(milkReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "csv")}"`, "Cache-Control": "no-store" } }); }
    return NextResponse.json({ error: "format must be json, pdf, xls or csv" }, { status: 400 });
  } catch (e) {
    console.error("mb.report.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the report." }, { status: 500 });
  }
}
