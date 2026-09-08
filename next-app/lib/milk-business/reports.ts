/* =============================================================
   PRIVATE Milk-Business — reports (one dataset → View/PDF/Excel/CSV/Print).
   Produces the shared MilkReport shape so the existing renderers
   (milkReportCsv / milkReportXls / renderMilkReportPdf) drive every format
   from the SAME filtered data (spec §35). New channel reports here; the
   tanker/procurement/inventory/consumption reports delegate to the existing
   buildMilkReport so there is one report engine. Paise / litres.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { type MilkReport, buildMilkReport, type MilkReportType } from "@/lib/milk/reports";
import { mbRangePnl } from "@/lib/milk-business/pnl";
import { warehouseOutstanding } from "@/lib/milk-business/warehouse";
import { outletOutstanding } from "@/lib/milk-business/outlet";
import { outstandingReport as b2bOutstandingReport, agingReport as b2bAgingReport } from "@/lib/b2b/outstanding";

export const MB_REPORT_TYPES = ["private-pnl", "warehouse-sales", "warehouse-customers", "warehouse-outstanding", "outlet-sales", "outlets", "outlet-outstanding", "b2b-outstanding", "b2b-aging", "continuity", "tanker", "procurement", "inventory", "consumption"] as const;
export type MbReportType = (typeof MB_REPORT_TYPES)[number];

const rup = (p: number) => "₹" + ((p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = (x: number) => (Math.round((x || 0) * 100) / 100).toLocaleString("en-IN");
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const dmy = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

export async function buildMbReport(type: MbReportType, fromIso: string, toIso: string): Promise<MilkReport> {
  // delegate the shared milk reports so there is a single report engine
  if (type === "tanker" || type === "procurement" || type === "inventory" || type === "consumption") {
    return buildMilkReport(type as MilkReportType, fromIso, toIso);
  }
  // delegate the B2B business-wise financial reports (spec §32/§12) to the existing engine
  if (type === "b2b-outstanding") return b2bOutstandingReport({ asOf: toIso });
  if (type === "b2b-aging") return b2bAgingReport({ asOf: toIso });

  const start = istDayWindow(fromIso).start;
  const end = istDayWindow(toIso).end;
  const range = `${dmy(fromIso)} — ${dmy(toIso)}`;
  const stamp = `Generated ${new Date().toLocaleString("en-IN")}`;

  if (type === "warehouse-sales") {
    const sales = await db.warehouseSale.findMany({ where: { saleDate: { gte: start, lt: end } }, orderBy: { soldAt: "asc" }, take: 5000 });
    const rows = sales.map((s) => [s.code, istDate(s.saleDate), s.customerName || "Anonymous", n2(s.litres) + " L", rup(s.pricePerLitrePaise), rup(s.grossPaise), rup(s.discountPaise), rup(s.netPaise), s.paymentStatus + (s.paymentMode ? " · " + s.paymentMode : ""), s.status]);
    const done = sales.filter((s) => s.status === "COMPLETED");
    const litres = done.reduce((a, s) => a + s.litres, 0), net = done.reduce((a, s) => a + s.netPaise, 0);
    return {
      type: "consumption", title: "Warehouse Walk-in Sales", subtitle: `${range} · ${done.length} completed sale(s) · ${n2(litres)} L · ${stamp}`, rowCount: sales.length,
      columns: [{ label: "Code" }, { label: "Date" }, { label: "Customer" }, { label: "Litres", right: true }, { label: "₹/L", right: true }, { label: "Gross", right: true }, { label: "Discount", right: true }, { label: "Net", right: true }, { label: "Payment" }, { label: "Status" }],
      rows, totalRow: ["TOTAL (completed)", "", "", n2(litres) + " L", "", "", "", rup(net), "", ""],
    };
  }

  if (type === "outlet-sales") {
    const sales = await db.outletSale.findMany({ where: { saleDate: { gte: start, lt: end } }, orderBy: { soldAt: "asc" }, take: 5000 });
    const rows = sales.map((s) => [s.code, istDate(s.saleDate), s.outletName || "—", n2(s.litres) + " L", rup(s.pricePerLitrePaise), rup(s.grossPaise), rup(s.netPaise), s.paymentStatus, s.status]);
    const done = sales.filter((s) => s.status === "COMPLETED");
    const litres = done.reduce((a, s) => a + s.litres, 0), net = done.reduce((a, s) => a + s.netPaise, 0);
    return {
      type: "consumption", title: "Retail Outlet Sales", subtitle: `${range} · ${done.length} completed sale(s) · ${n2(litres)} L · ${stamp}`, rowCount: sales.length,
      columns: [{ label: "Code" }, { label: "Date" }, { label: "Outlet" }, { label: "Litres", right: true }, { label: "₹/L", right: true }, { label: "Gross", right: true }, { label: "Net", right: true }, { label: "Payment" }, { label: "Status" }],
      rows, totalRow: ["TOTAL (completed)", "", "", n2(litres) + " L", "", "", rup(net), "", ""],
    };
  }

  if (type === "warehouse-customers") {
    const grp = await db.warehouseSale.groupBy({ by: ["customerId", "customerName"], where: { status: "COMPLETED", saleDate: { gte: start, lt: end } }, _sum: { litres: true, netPaise: true }, _count: true });
    const rows = grp.map((g) => { const l = g._sum.litres ?? 0, net = g._sum.netPaise ?? 0; return [g.customerName || "Anonymous", n2(l) + " L", rup(l > 0 ? Math.round(net / l) : 0), rup(net), String(g._count)]; });
    const l = grp.reduce((a, g) => a + (g._sum.litres ?? 0), 0), net = grp.reduce((a, g) => a + (g._sum.netPaise ?? 0), 0);
    return {
      type: "consumption", title: "Warehouse Customer Report", subtitle: `${range} · ${grp.length} customer(s) · ${stamp}`, rowCount: grp.length,
      columns: [{ label: "Customer" }, { label: "Litres", right: true }, { label: "Avg ₹/L", right: true }, { label: "Revenue", right: true }, { label: "Sales", right: true }],
      rows, totalRow: ["TOTAL", n2(l) + " L", "", rup(net), ""],
    };
  }

  if (type === "outlets") {
    const grp = await db.outletSale.groupBy({ by: ["outletId", "outletName"], where: { status: "COMPLETED", saleDate: { gte: start, lt: end } }, _sum: { litres: true, netPaise: true }, _count: true });
    const rows = grp.map((g) => { const l = g._sum.litres ?? 0, net = g._sum.netPaise ?? 0; return [g.outletName || "—", n2(l) + " L", rup(l > 0 ? Math.round(net / l) : 0), rup(net), String(g._count)]; });
    const l = grp.reduce((a, g) => a + (g._sum.litres ?? 0), 0), net = grp.reduce((a, g) => a + (g._sum.netPaise ?? 0), 0);
    return {
      type: "consumption", title: "Retail Outlet Report", subtitle: `${range} · ${grp.length} outlet(s) · ${stamp}`, rowCount: grp.length,
      columns: [{ label: "Outlet" }, { label: "Litres", right: true }, { label: "Avg ₹/L", right: true }, { label: "Revenue", right: true }, { label: "Sales", right: true }],
      rows, totalRow: ["TOTAL", n2(l) + " L", "", rup(net), ""],
    };
  }

  if (type === "continuity") {
    const tankers = await db.milkTanker.findMany({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } }, orderBy: [{ continuityChainId: "asc" }, { continuitySequence: "asc" }, { procurementDate: "asc" }], select: { code: true, continuityChainId: true, continuityType: true, continuitySequence: true, litres: true, freshoutLitres: true, consumedLitres: true, remainingLitres: true, totalCostPaise: true, fatPct: true, status: true } });
    const rows = tankers.map((t) => [t.continuityChainId || "—", t.code, t.continuityType, String(t.continuitySequence), n2(t.litres) + " L", n2(t.freshoutLitres) + " L", n2(t.litres + t.freshoutLitres) + " L", n2(t.consumedLitres) + " L", n2(t.remainingLitres) + " L", t.fatPct + "%", rup(t.totalCostPaise), t.status]);
    const orig = tankers.reduce((s, t) => s + t.litres, 0), fo = tankers.reduce((s, t) => s + t.freshoutLitres, 0), rem = tankers.reduce((s, t) => s + (t.status === "OPEN" ? t.remainingLitres : 0), 0), cash = tankers.reduce((s, t) => s + t.totalCostPaise, 0);
    const chains = new Set(tankers.map((t) => t.continuityChainId).filter(Boolean)).size;
    return {
      type: "tanker", title: "Continuity Chain Report", subtitle: `${range} · ${chains} chain(s) · ${tankers.length} tanker(s) · current available ${n2(rem)} L · ${stamp}`, rowCount: tankers.length,
      columns: [{ label: "Chain" }, { label: "Tanker" }, { label: "Type" }, { label: "Seq", right: true }, { label: "Original", right: true }, { label: "Fresh-out", right: true }, { label: "Effective", right: true }, { label: "Consumed", right: true }, { label: "Remaining", right: true }, { label: "FAT", right: true }, { label: "Cost", right: true }, { label: "Status" }],
      rows, totalRow: ["TOTAL", "", "", "", n2(orig) + " L", n2(fo) + " L", n2(orig + fo) + " L", "", n2(rem) + " L (open)", "", rup(cash), ""],
    };
  }

  if (type === "warehouse-outstanding") {
    const rows0 = await warehouseOutstanding();
    const rows = rows0.map((r) => [r.customerName, String(r.openSales), rup(r.outstandingPaise)]);
    const total = rows0.reduce((a, r) => a + r.outstandingPaise, 0);
    return {
      type: "consumption", title: "Warehouse Outstanding (credit sales)", subtitle: `As of ${dmy(toIso)} · ${rows0.length} customer(s) owing · ${stamp}`, rowCount: rows0.length,
      columns: [{ label: "Customer" }, { label: "Open sales", right: true }, { label: "Outstanding", right: true }],
      rows, totalRow: ["TOTAL", "", rup(total)],
    };
  }

  if (type === "outlet-outstanding") {
    const rows0 = await outletOutstanding();
    const rows = rows0.map((r) => [r.outletName, String(r.openSales), rup(r.outstandingPaise)]);
    const total = rows0.reduce((a, r) => a + r.outstandingPaise, 0);
    return {
      type: "consumption", title: "Retail Outlet Outstanding (credit sales)", subtitle: `As of ${dmy(toIso)} · ${rows0.length} outlet(s) owing · ${stamp}`, rowCount: rows0.length,
      columns: [{ label: "Outlet" }, { label: "Open sales", right: true }, { label: "Outstanding", right: true }],
      rows, totalRow: ["TOTAL", "", rup(total)],
    };
  }

  // private-pnl — the B2B + Warehouse + Outlet statement (spec §25/§29)
  const p = await mbRangePnl(fromIso, toIso);
  const rows: string[][] = [
    ["B2B revenue (delivered, net GST)", rup(p.b2bRevenuePaise)],
    ["Warehouse walk-in revenue", rup(p.warehouseRevenuePaise)],
    ["Retail outlet revenue", rup(p.outletRevenuePaise)],
    ["Revenue", rup(p.revenuePaise)],
    ["Less: COGS (milk sold, FIFO)", rup(p.cogsPaise)],
    ["Gross profit", `${rup(p.grossProfitPaise)}  (${p.grossMarginPct}%)`],
    ["Less: Expenses (date-based)", rup(p.expensesPaise)],
    ["B2B — KG sold", `${n2(p.b2bKg)} kg · avg ${rup(p.avgB2bPricePerKgPaise)}/kg`],
    ["B2B — orders / businesses", `${p.b2bOrders} · ${p.b2bBusinesses}`],
    ["Warehouse — litres / sales", `${n2(p.warehouseLitres)} L · ${p.warehouseSales} sale(s) · avg ${rup(p.avgWarehousePricePerLitrePaise)}/L`],
    ["Outlet — litres / sales", `${n2(p.outletLitres)} L · ${p.outletSales} sale(s)`],
    ["Milk sold (COGS basis)", `${n2(p.litresSold)} L`],
  ];
  return {
    type: "pnl", title: "Private Milk-Business P&L (B2B + Walk-in + Outlet)", subtitle: `${range} · ${stamp}`, rowCount: rows.length,
    columns: [{ label: "Item" }, { label: "Amount", right: true }],
    rows, totalRow: ["NET PROFIT", `${rup(p.netProfitPaise)}  (${p.netMarginPct}%)`],
  };
}
