/* GET /api/b2b/invoices/export?format=pdf|xls|csv&<the SAME filter params as the list>
   Exports EXACTLY the on-screen filtered invoice register (reuses invoiceWhere via
   b2bInvoicesReport). Admin / Super-Admin. Every download is audited with the filters. */
import { NextRequest, NextResponse } from "next/server";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { b2bInvoicesReport, type InvoiceSort, type InvoiceFilterArgs } from "@/lib/b2b/invoices";
import { milkReportCsv, milkReportXls, milkReportFilename, type MilkReport } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filterSubtitle(sp: URLSearchParams): string {
  const bits: string[] = [];
  if (sp.get("from") || sp.get("to") || sp.get("dateType")) bits.push(`${sp.get("dateType") || "issued"} ${sp.get("from") || "…"}→${sp.get("to") || "…"}`);
  if (sp.get("status")) bits.push("status " + sp.get("status"));
  if (sp.get("overdue") === "1") bits.push("overdue only");
  if (sp.get("businessId")) bits.push("one business");
  if (sp.get("q")) bits.push(`search "${sp.get("q")}"`);
  if (sp.get("amountFrom") || sp.get("amountTo")) bits.push("amount range");
  return bits.length ? bits.join(" · ") : "All invoices";
}

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") || "pdf").toLowerCase();
  const filters: InvoiceFilterArgs & { sort?: InvoiceSort } = {
    status: sp.get("status") ?? undefined,
    businessId: sp.get("businessId") ?? undefined,
    q: sp.get("q") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    dateType: (sp.get("dateType") as InvoiceFilterArgs["dateType"]) ?? undefined,
    amountFromPaise: sp.get("amountFrom") ? Math.round(Number(sp.get("amountFrom")) * 100) : undefined,
    amountToPaise: sp.get("amountTo") ? Math.round(Number(sp.get("amountTo")) * 100) : undefined,
    overdue: sp.get("overdue") === "1",
    sort: (sp.get("sort") as InvoiceSort) ?? undefined,
  };
  const subtitle = filterSubtitle(sp);
  const log = (fmt: string) => audit({ userId: actorId(req) ?? null, actorRole: role, action: "b2b.invoices.export", target: `${fmt.toUpperCase()} · ${subtitle}`, ctx: reqContext(req) }).catch(() => {});

  try {
    const report = await b2bInvoicesReport(filters, { subtitle });
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
    console.error("b2b.invoices.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not export invoices." }, { status: 500 });
  }
}
