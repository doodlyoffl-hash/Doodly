/* GET /api/admin/milk/tankers/[id]/report?format=json|pdf|xls|csv
   One tanker's reconciliation / closing report (procurement:view). OPEN → live;
   CLOSED → frozen immutable snapshot. Every export is audited. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { getTankerReport, buildTankerReportTable, tankerReportFilename } from "@/lib/milk/tanker-report";
import { milkReportCsv, milkReportXls } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { requirePermission(req, "procurement", "view"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  try {
    const res = await getTankerReport(params.id);
    if (!res) return NextResponse.json({ error: "Tanker not found" }, { status: 404 });
    const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
    if (format === "json") return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });

    const table = buildTankerReportTable(res.recon);
    const code = res.recon.tanker.code;
    const log = async (fmt: string) => { await audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "milk.tanker.export", target: `${code} · ${fmt.toUpperCase()} · ${table.rowCount} line(s)`, ctx: reqContext(req) }).catch(() => {}); };

    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(table); await log("pdf");
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${tankerReportFilename(code, "pdf")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") { await log("xls"); return new NextResponse(milkReportXls(table), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${tankerReportFilename(code, "xls")}"`, "Cache-Control": "no-store" } }); }
    if (format === "csv") { await log("csv"); return new NextResponse(milkReportCsv(table), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tankerReportFilename(code, "csv")}"`, "Cache-Control": "no-store" } }); }
    return NextResponse.json({ error: "format must be json, pdf, xls or csv" }, { status: 400 });
  } catch (e) {
    console.error("milk.tanker.report", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the tanker report." }, { status: 500 });
  }
}
