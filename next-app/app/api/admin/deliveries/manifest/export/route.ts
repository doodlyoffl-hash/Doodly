/* GET /api/admin/deliveries/manifest/export?date=YYYY-MM-DD&format=pdf|xls|csv|json
   The delivery manifest / dispatch sheet for an IST delivery day (default today):
   every stop with customer, address, mobile, products, bottles, type and special
   instructions, grouped into rounds per executive.
   RBAC deliveries:view. Every download is audited (Step 13). */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { manifestReport, manifestCsv, manifestXls, manifestFilename } from "@/lib/ops/manifest-report";
import { renderManifestPdf } from "@/lib/ops/manifest-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requirePermission(req, "deliveries", "view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const format = (sp.get("format") || "pdf").toLowerCase();

  const logDownload = (fmt: string, day: string, stops: number) =>
    audit({
      userId: readUserId(req) ?? null, actorRole: readRole(req),
      action: "ops.manifest.export",
      target: `${day} · ${fmt.toUpperCase()} · ${stops} stop(s)`,
      ctx: reqContext(req),
    }).catch(() => { /* never block a download on the audit */ });

  try {
    if (format === "pdf") {
      const { bytes, filename, report } = await renderManifestPdf(date);
      await logDownload("pdf", report.date, report.totals.stops);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const report = await manifestReport(date);
    if (format === "json") { await logDownload("json", report.date, report.totals.stops); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "xls") {
      await logDownload("xls", report.date, report.totals.stops);
      return new NextResponse(manifestXls(report), {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${manifestFilename(report.date, "xls")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "csv") {
      await logDownload("csv", report.date, report.totals.stops);
      return new NextResponse(manifestCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${manifestFilename(report.date, "csv")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("manifest.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the manifest." }, { status: 500 });
  }
}
