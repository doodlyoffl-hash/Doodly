/* GET /api/b2b/orders/export?format=pdf|xls|csv&<the SAME filter params as the list>
   Exports EXACTLY the on-screen filtered set (reuses lib/b2b/order-query's shared predicate).
   Admin / Super-Admin. Every download is audited with the applied filters. */
import { NextRequest, NextResponse } from "next/server";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { b2bOrdersReport, parseB2BFilters, type SortKey } from "@/lib/b2b/order-query";
import { milkReportCsv, milkReportXls, milkReportFilename } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";
import type { MilkReport } from "@/lib/milk/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filterSubtitle(sp: URLSearchParams): string {
  const bits: string[] = [];
  if (sp.get("from") || sp.get("to") || sp.get("dateType")) bits.push(`${sp.get("dateType") || "created"} ${sp.get("from") || "…"}→${sp.get("to") || "…"}`);
  if (sp.get("statuses")) bits.push("status " + sp.get("statuses"));
  if (sp.get("paymentStatuses")) bits.push("payment " + sp.get("paymentStatuses"));
  if (sp.get("unit")) bits.push("unit " + sp.get("unit"));
  if (sp.get("invoice")) bits.push("invoice " + sp.get("invoice"));
  if (sp.get("businessId")) bits.push("one business");
  if (sp.get("q")) bits.push(`search "${sp.get("q")}"`);
  if (sp.get("valueMin") || sp.get("valueMax")) bits.push("value range");
  if (sp.get("revenueMin") || sp.get("revenueMax")) bits.push("revenue range");
  if (sp.get("qtyMin") || sp.get("qtyMax")) bits.push("qty range");
  return bits.length ? bits.join(" · ") : "All orders";
}

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") || "pdf").toLowerCase();
  const filters = parseB2BFilters(sp);
  const sort = (sp.get("sort") as SortKey) ?? "newest";
  const subtitle = filterSubtitle(sp);
  const log = (fmt: string) => audit({ userId: actorId(req) ?? null, actorRole: role, action: "b2b.orders.export", target: `${fmt.toUpperCase()} · ${subtitle}`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await b2bOrdersReport(filters, { sort, subtitle });
    if (format === "json") { await log("json"); return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } }); }
    if (format === "csv") {
      await log("csv");
      return new NextResponse(milkReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "csv")}"`, "Cache-Control": "no-store" } });
    }
    if (format === "xls") {
      await log("xls");
      return new NextResponse(milkReportXls(report), { headers: { "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${milkReportFilename(report, "xls")}"`, "Cache-Control": "no-store" } });
    }
    const { bytes } = await renderMilkReportPdf(report as MilkReport);
    await log("pdf");
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${milkReportFilename(report, "pdf")}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.orders.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not export orders." }, { status: 500 });
  }
}
