/* GET /api/admin/bottles/report/export?kind=customers|executives&format=pdf|xls|csv|json
   The bottle-return report: per-customer accountability (delivered/returned/pending/
   overdue/lost/deposit) or per-executive collection performance. RBAC bottleInventory:export.
   Audited. Renders through the shared report PDF. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { bottleReport, bottleExecReport, reportCsv, reportXls, bottleReportFilename, type BottleReport } from "@/lib/ops/bottle-report";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { requirePermission(req, "bottleInventory", "export"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const kind = (sp.get("kind") || "customers").toLowerCase();
  const format = (sp.get("format") || "pdf").toLowerCase();
  const scope = (sp.get("scope") || "outstanding").toLowerCase() === "all" ? "all" : "outstanding";
  const report: BottleReport = kind === "executives" ? await bottleExecReport() : await bottleReport(scope);
  const fkind = kind === "executives" ? "Executives" : scope === "all" ? "Customers_All" : "Customers";
  const log = (fmt: string) => audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "bottle.report.export", target: `${fkind} · ${fmt.toUpperCase()} · ${report.rowCount} row(s)`, ctx: reqContext(req) }).catch(() => {});

  try {
    if (format === "json") { await log("json"); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
      await log("pdf");
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${bottleReportFilename(fkind, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls");
      return new NextResponse(reportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${bottleReportFilename(fkind, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv");
      return new NextResponse(reportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${bottleReportFilename(fkind, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("bottle.report.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the bottle report." }, { status: 500 });
  }
}
