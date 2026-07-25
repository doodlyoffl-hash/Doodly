/* GET /api/admin/subscriptions/lifecycle-reports/export
   ?type=cancelled|adjusted|extended|operational|customer_requested
   &format=csv|xls|pdf|json &from=YYYY-MM-DD &to=YYYY-MM-DD
   Audited download of the subscription-lifecycle reports. Reuses the milk
   report CSV/XLS/PDF renderers (shared table shape). Admin / Super-Admin. */
import { NextRequest, NextResponse } from "next/server";
import { requireSubsAdmin } from "@/lib/subscriptions/guard";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { buildLifecycleReport, LIFECYCLE_REPORT_TYPES, type LifecycleReportType } from "@/lib/subscriptions/lifecycle-reports";
import { milkReportCsv, milkReportXls } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const todayIso = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const role = requireSubsAdmin(req);
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") as LifecycleReportType;
  if (!LIFECYCLE_REPORT_TYPES.includes(type)) return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  const format = (sp.get("format") || "csv").toLowerCase();
  const to = sp.get("to") || todayIso();
  const from = sp.get("from") || to;

  const report = await buildLifecycleReport(type, from, to);
  const base = `DOODLY_${type}_${new Date().toISOString().slice(0, 10)}`;
  const noStore = { "Cache-Control": "no-store" };
  await audit({ actorRole: role, action: "subscription.report.export", target: `${type}:${format}`, ctx: reqContext(req) });

  if (format === "json") return NextResponse.json(report, { headers: noStore });
  if (format === "pdf") {
    const { bytes } = await renderMilkReportPdf(report);
    return new NextResponse(Buffer.from(bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` } });
  }
  if (format === "xls") return new NextResponse(milkReportXls(report), { headers: { ...noStore, "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="${base}.xls"` } });
  return new NextResponse(milkReportCsv(report), { headers: { ...noStore, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
