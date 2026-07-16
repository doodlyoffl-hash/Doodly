/* GET /api/admin/deliveries/packing/export?date=YYYY-MM-DD&format=pdf|xls|csv|json
   The dairy's product-aggregated packing list for an IST delivery day (default today).
   pdf → branded print-ready sheet · xls → opens in Excel · csv → Excel/Sheets · json → raw.
   RBAC deliveries:view. Every download is audited (Step 13). */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { packingListReport, packingCsv, packingXls, packingFilename } from "@/lib/ops/packing-report";
import { renderPackingListPdf } from "@/lib/ops/packing-pdf";

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

  try {
    const logDownload = async (fmt: string, day: string, rows: number) => {
      await audit({
        userId: readUserId(req) ?? null, actorRole: readRole(req),
        action: "ops.packing.export",
        target: `${day} · ${fmt.toUpperCase()} · ${rows} line(s)`,
        ctx: reqContext(req),
      }).catch(() => { /* never block a download on the audit */ });
    };

    if (format === "pdf") {
      const { bytes, filename, report } = await renderPackingListPdf(date);
      await logDownload("pdf", report.date, report.lines.length);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const report = await packingListReport(date);
    if (format === "json") { await logDownload("json", report.date, report.lines.length); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }

    if (format === "xls") {
      await logDownload("xls", report.date, report.lines.length);
      return new NextResponse(packingXls(report), {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${packingFilename(report.date, "xls")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "csv") {
      await logDownload("csv", report.date, report.lines.length);
      return new NextResponse(packingCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${packingFilename(report.date, "csv")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ error: "format must be pdf, xls, csv or json" }, { status: 400 });
  } catch (e) {
    console.error("packing.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the packing list." }, { status: 500 });
  }
}
