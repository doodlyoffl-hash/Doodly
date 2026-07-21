/* GET /api/admin/milk/reports/export?type=&format=pdf|xls|csv|json&from=&to=
   Milk operational + financial reports. type ∈ procurement|consumption|inventory|
   tanker|pnl. RBAC procurement:view. Every download audited (mirrors the packing
   export). Defaults: current IST month range. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { buildMilkReport, milkReportCsv, milkReportXls, milkReportFilename, MILK_REPORT_TYPES, type MilkReportType } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthBounds(): { from: string; to: string } {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth();
  const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}

export async function GET(req: NextRequest) {
  try { requirePermission(req, "procurement", "view"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "procurement").toLowerCase();
  if (!MILK_REPORT_TYPES.includes(type as MilkReportType)) return NextResponse.json({ error: "unknown report type" }, { status: 400 });
  const format = (sp.get("format") || "pdf").toLowerCase();
  const def = monthBounds();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") || "") ? sp.get("from")! : def.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") || "") ? sp.get("to")! : def.to;

  try {
    const report = await buildMilkReport(type as MilkReportType, from, to);
    const log = async (fmt: string) => { await audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "milk.report.export", target: `${type} · ${fmt.toUpperCase()} · ${from}→${to} · ${report.rowCount} row(s)`, ctx: reqContext(req) }).catch(() => {}); };

    if (format === "json") { await log("json"); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      const { bytes, filename } = await renderMilkReportPdf(report);
      await log("pdf");
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls");
      return new NextResponse(milkReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv");
      return new NextResponse(milkReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("milk.report.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the report." }, { status: 500 });
  }
}
