/* GET /api/b2b/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=pdf|xls|csv|json
   B2B sales report grouped by product × unit — quantity, revenue, ASP, and milk
   COGS/profit + by-unit (KG vs Litre) analytics. Admin / Super-Admin (canUseB2B).
   Renders through the shared milk-report PDF. Every download is audited. */
import { NextRequest, NextResponse } from "next/server";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { b2bSalesReport, b2bSalesReportCsv, b2bSalesReportXls, b2bSalesReportFilename } from "@/lib/b2b/sales-report";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isoDay = (s: string | null): string => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10));

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const to = isoDay(sp.get("to"));
  const from = isoDay(sp.get("from") ?? to);
  const format = (sp.get("format") || "pdf").toLowerCase();

  const log = (fmt: string) => audit({ userId: actorId(req) ?? null, actorRole: role, action: "b2b.salesReport.export", target: `${from}→${to} · ${fmt.toUpperCase()}`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await b2bSalesReport(from, to);
    if (format === "json") { await log("json"); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
      await log("pdf");
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${b2bSalesReportFilename(from, to, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls");
      return new NextResponse(b2bSalesReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${b2bSalesReportFilename(from, to, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv");
      return new NextResponse(b2bSalesReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${b2bSalesReportFilename(from, to, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("b2b.salesReport.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the B2B sales report." }, { status: 500 });
  }
}
