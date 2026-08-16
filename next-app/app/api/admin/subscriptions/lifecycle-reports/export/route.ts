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
  let role;
  try { role = requireSubsAdmin(req); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") as LifecycleReportType;
  if (!LIFECYCLE_REPORT_TYPES.includes(type)) return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  const format = (sp.get("format") || "csv").toLowerCase();
  const to = sp.get("to") || todayIso();
  const from = sp.get("from") || to;
  const base = `DOODLY_${type}_${new Date().toISOString().slice(0, 10)}`;
  const noStore = { "Cache-Control": "no-store" };

  try {
    const report = await buildLifecycleReport(type, from, to);
    await audit({ actorRole: role, action: "subscription.report.export", target: `${type} · ${format} · ${from}→${to} · ${report.rowCount} row(s)`, ctx: reqContext(req) }).catch(() => {});

    if (format === "json") {
      await audit({ actorRole: role, action: "subscription.report.view", target: `${type} · ${report.rowCount} row(s)`, ctx: reqContext(req) }).catch(() => {});
      return NextResponse.json(report, { headers: noStore });
    }
    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(report);
      return new NextResponse(Buffer.from(bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` } });
    }
    if (format === "xls") return new NextResponse(milkReportXls(report), { headers: { ...noStore, "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.xls"` } });
    return new NextResponse(milkReportCsv(report), { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  } catch (e) {
    console.error("subscription.report.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the report." }, { status: 500 });
  }
}
