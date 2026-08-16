/* GET /api/admin/deliveries/packing-sheet/export?date=YYYY-MM-DD&format=pdf|xls|csv|json
   The Packing Sheet for an IST delivery day: every customer × bottle size with
   bottles + litres, plus route/executive when assigned, and a per-size summary.
   Uses the SAME packingSummary() the on-screen card + ops summary use, so the
   exported numbers always match the live database. RBAC deliveries:view; audited. */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { packingSummary } from "@/lib/delivery/packing";
import { milkReportCsv, milkReportXls, type MilkReport } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dmy = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

export async function GET(req: NextRequest) {
  try { requirePermission(req, "deliveries", "view"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const format = (sp.get("format") || "pdf").toLowerCase();
  const noStore = { "Cache-Control": "no-store" };

  try {
    const p = await packingSummary(date);
    const sizeSummary = p.sizes.map((s) => `${s.label} ${s.bottles}`).join(" · ") || "no bottles";
    const report = {
      type: "packing",
      title: "Packing Sheet — bottles by size",
      subtitle: `${dmy(p.date)} · ${sizeSummary} · ${p.totals.bottles} bottle(s) · ${p.totals.litres} L · ${p.totals.orders} order(s) · ${p.totals.customers} customer(s)`,
      columns: [
        { label: "Customer" }, { label: "Order" }, { label: "Bottle size" },
        { label: "Bottles", right: true }, { label: "Litres", right: true },
        { label: "Route" }, { label: "Executive" },
      ],
      rows: p.lines.map((l) => [l.customer, l.orderId, l.sizeLabel, String(l.bottles), l.litres.toFixed(2), l.route || "—", l.executive || "—"]),
      totalRow: ["TOTAL", "", "", String(p.totals.bottles), p.totals.litres.toFixed(2), "", ""],
      rowCount: p.lines.length,
    } as unknown as MilkReport;

    await audit({
      userId: readUserId(req) ?? null, actorRole: readRole(req),
      action: "ops.packing.export",
      target: `${p.date} · ${format.toUpperCase()} · ${p.totals.bottles} bottle(s) · ${p.lines.length} line(s)`,
      ctx: reqContext(req),
    }).catch(() => { /* never block a download on the audit */ });

    const base = `DOODLY_Packing_Sheet_${p.date}`;
    if (format === "json") {
      await audit({ userId: readUserId(req) ?? null, actorRole: readRole(req), action: "deliveries.report.view", target: `packing · ${p.date} · ${p.lines.length} line(s)`, ctx: reqContext(req) }).catch(() => {});
      return NextResponse.json({ ...p, report }, { headers: noStore });
    }
    if (format === "pdf") {
      const { bytes } = await renderMilkReportPdf(report);
      return new NextResponse(Buffer.from(bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("inline") === "1" ? "inline" : "attachment"}; filename="${base}.pdf"` } });
    }
    if (format === "xls") return new NextResponse(milkReportXls(report), { headers: { ...noStore, "Content-Type": "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.xls"` } });
    return new NextResponse(milkReportCsv(report), { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  } catch (e) {
    console.error("ops.packing.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the packing sheet." }, { status: 500 });
  }
}
