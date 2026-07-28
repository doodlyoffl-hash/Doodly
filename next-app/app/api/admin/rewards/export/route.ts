/* GET /api/admin/rewards/export?format=csv|xls|pdf|json&status=&source=&search=
   Download the reward ledger (respects the same filters as the admin table).
   RBAC: rewards:export (marketing/admin/super_admin). Every download is audited.
   Streams binary/text via raw NextResponse (not the ok() envelope). */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readRole, readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { buildRewardLedgerReport, rewardReportCsv, rewardReportXls, rewardReportFilename } from "@/lib/rewards/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { requirePermission(req, "rewards", "export"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") || "csv").toLowerCase();
  const report = await buildRewardLedgerReport({ status: sp.get("status"), source: sp.get("source"), search: sp.get("search") });

  const logExport = (fmt: string) => audit({
    userId: readUserId(req) ?? null, actorRole: readRole(req),
    action: "reward.report.export", target: `${fmt.toUpperCase()} · ${report.rowCount} reward(s)`, ctx: reqContext(req),
  }).catch(() => {});

  if (format === "json") return NextResponse.json(report);

  if (format === "pdf") {
    // The Milk PDF renderer is a generic table renderer over the same report model.
    const { bytes } = await renderMilkReportPdf(report as unknown as MilkReport);
    await logExport("pdf");
    return new NextResponse(Buffer.from(bytes), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${sp.get("inline") ? "inline" : "attachment"}; filename="${rewardReportFilename("pdf")}"`,
      "Cache-Control": "no-store",
    } });
  }

  if (format === "xls") {
    await logExport("xls");
    return new NextResponse(rewardReportXls(report), { headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${rewardReportFilename("xls")}"`,
      "Cache-Control": "no-store",
    } });
  }

  await logExport("csv");
  return new NextResponse(rewardReportCsv(report), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${rewardReportFilename("csv")}"`,
    "Cache-Control": "no-store",
  } });
}
