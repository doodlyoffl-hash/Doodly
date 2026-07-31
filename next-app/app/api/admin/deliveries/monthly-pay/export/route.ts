/* GET /api/admin/deliveries/monthly-pay/export?month=YYYY-MM&format=pdf|xls|csv|json
   The per-executive monthly driver-pay summary (default current IST month): days
   worked, GPS km, deliveries, hours and estimated pay (base × days + fuel × km +
   per-delivery × deliveries, floored per day). Excludes the discretionary monthly
   bonus. RBAC deliveries:export. Every download is audited. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { monthlyPayReport, monthlyPayReportCsv, monthlyPayReportXls, monthlyPayReportFilename } from "@/lib/ops/monthly-pay-report";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { requirePermission(req, "deliveries", "export"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const month = sp.get("month");
  const format = (sp.get("format") || "pdf").toLowerCase();

  const log = (fmt: string, m: string, execs: number) =>
    audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "ops.monthlyPay.export", target: `${m} · ${fmt.toUpperCase()} · ${execs} exec(s)`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await monthlyPayReport(month);
    if (format === "json") { await log("json", report.date, report.totals.executives); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
      await log("pdf", report.date, report.totals.executives);
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${monthlyPayReportFilename(report.date, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls", report.date, report.totals.executives);
      return new NextResponse(monthlyPayReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${monthlyPayReportFilename(report.date, "xls")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "csv") {
      await log("csv", report.date, report.totals.executives);
      return new NextResponse(monthlyPayReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${monthlyPayReportFilename(report.date, "csv")}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("monthly-pay.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the monthly pay summary." }, { status: 500 });
  }
}
