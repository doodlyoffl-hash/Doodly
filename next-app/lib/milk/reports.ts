/* =============================================================
   DOODLY — Milk operational + financial reports.
   One normalized tabular model (columns + rows + optional total row) so a
   single set of CSV / XLS / PDF renderers covers every report type:
     procurement  — tankers bought in the range
     consumption  — milk drawn (FIFO) per day + channel
     inventory    — open lots on hand right now (snapshot)
     tanker       — per-lot cost vs consumed vs remaining
     pnl          — Revenue − COGS − Expenses statement
   Money cells carry the ₹ symbol (fine for CSV/XLS/screen); the PDF renderer
   sanitises ₹ → "Rs." because the standard PDF font has no rupee glyph.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { getInventory } from "@/lib/milk/tanker";
import { rangePnl } from "@/lib/milk/pnl";

export type MilkReportType = "procurement" | "consumption" | "inventory" | "tanker" | "pnl";
export const MILK_REPORT_TYPES: MilkReportType[] = ["procurement", "consumption", "inventory", "tanker", "pnl"];

export interface MilkReport {
  type: MilkReportType;
  title: string;
  subtitle: string;
  columns: { label: string; right?: boolean }[];
  rows: string[][];
  totalRow?: string[];
  rowCount: number;
}

const rup = (p: number) => "₹" + ((p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = (x: number) => (Math.round((x || 0) * 100) / 100).toLocaleString("en-IN");
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const dmy = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

/** Build one report over an IST range [from, to] inclusive. `from`/`to` = YYYY-MM-DD. */
export async function buildMilkReport(type: MilkReportType, fromIso: string, toIso: string): Promise<MilkReport> {
  const start = istDayWindow(fromIso).start;
  const end = istDayWindow(toIso).end;
  const range = `${dmy(fromIso)} — ${dmy(toIso)}`;
  const stamp = `Generated ${new Date().toLocaleString("en-IN")}`;

  if (type === "procurement") {
    const tankers = await db.milkTanker.findMany({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } }, orderBy: [{ procurementDate: "asc" }, { createdAt: "asc" }] });
    const rows = tankers.map((t) => [t.code, istDate(t.procurementDate), t.tankerNo, t.supplier, n2(t.quantityKg), t.fatPct + "%", n2(t.litres), rup(t.costPerLitrePaise), rup(t.totalCostPaise), t.status]);
    const kg = tankers.reduce((s, t) => s + t.quantityKg, 0), l = tankers.reduce((s, t) => s + t.litres, 0), cash = tankers.reduce((s, t) => s + t.totalCostPaise, 0);
    return {
      type, title: "Milk Procurement Report", subtitle: `${range} · ${tankers.length} tanker(s) · ${stamp}`, rowCount: tankers.length,
      columns: [{ label: "Code" }, { label: "Date" }, { label: "Tanker" }, { label: "Supplier" }, { label: "KG", right: true }, { label: "FAT", right: true }, { label: "Litres", right: true }, { label: "Cost/L", right: true }, { label: "Total cost", right: true }, { label: "Status" }],
      rows, totalRow: ["TOTAL", "", "", "", n2(kg), "", n2(l), "", rup(cash), ""],
    };
  }

  if (type === "consumption") {
    const cons = await db.tankerConsumption.groupBy({ by: ["date", "channel"], where: { date: { gte: start, lt: end } }, _sum: { litres: true, costPaise: true }, orderBy: { date: "asc" } });
    const rows = cons.map((c) => [istDate(c.date), c.channel, n2(c._sum.litres ?? 0) + " L", rup(c._sum.costPaise ?? 0)]);
    const l = cons.reduce((s, c) => s + (c._sum.litres ?? 0), 0), cost = cons.reduce((s, c) => s + (c._sum.costPaise ?? 0), 0);
    return {
      type, title: "Milk Sales & Consumption Report", subtitle: `${range} · ${n2(l)} L drawn · ${stamp}`, rowCount: cons.length,
      columns: [{ label: "Date" }, { label: "Channel" }, { label: "Litres", right: true }, { label: "COGS", right: true }],
      rows, totalRow: ["TOTAL", "", n2(l) + " L", rup(cost)],
    };
  }

  if (type === "inventory") {
    const inv = await getInventory();
    const rows = inv.openLots.map((l) => [l.code, istDate(l.procurementDate), l.tankerNo, l.supplier, n2(l.remainingLitres) + " L", rup(l.costPerLitrePaise), rup(l.valuePaise)]);
    return {
      type, title: "Milk Inventory Report (on hand now)", subtitle: `${inv.openCount} open lot(s) · ${n2(inv.remainingLitres)} L · ${stamp}`, rowCount: inv.openLots.length,
      columns: [{ label: "Code" }, { label: "Procured" }, { label: "Tanker" }, { label: "Supplier" }, { label: "Remaining", right: true }, { label: "Cost/L", right: true }, { label: "Value", right: true }],
      rows, totalRow: ["TOTAL", "", "", "", n2(inv.remainingLitres) + " L", "", rup(inv.remainingValuePaise)],
    };
  }

  if (type === "tanker") {
    const tankers = await db.milkTanker.findMany({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } }, orderBy: [{ procurementDate: "asc" }] });
    const ids = tankers.map((t) => t.id);
    const cogs = ids.length ? await db.tankerConsumption.groupBy({ by: ["tankerId"], where: { tankerId: { in: ids } }, _sum: { costPaise: true } }) : [];
    const cogsById = new Map(cogs.map((c) => [c.tankerId, c._sum.costPaise ?? 0]));
    const rows = tankers.map((t) => [t.code, istDate(t.procurementDate), t.supplier, n2(t.litres) + " L", n2(t.consumedLitres) + " L", n2(t.remainingLitres) + " L", rup(t.totalCostPaise), rup(cogsById.get(t.id) ?? 0), t.status]);
    const cash = tankers.reduce((s, t) => s + t.totalCostPaise, 0), realized = tankers.reduce((s, t) => s + (cogsById.get(t.id) ?? 0), 0);
    return {
      type, title: "Tanker Cost & Consumption Report", subtitle: `${range} · ${tankers.length} tanker(s) · ${stamp}`, rowCount: tankers.length,
      columns: [{ label: "Code" }, { label: "Date" }, { label: "Supplier" }, { label: "Litres", right: true }, { label: "Consumed", right: true }, { label: "Remaining", right: true }, { label: "Total cost", right: true }, { label: "COGS realized", right: true }, { label: "Status" }],
      rows, totalRow: ["TOTAL", "", "", "", "", "", rup(cash), rup(realized), ""],
    };
  }

  // pnl — a statement rendered as a 2-column table
  const p = await rangePnl(fromIso, toIso);
  const rows: string[][] = [
    ["Retail revenue", rup(p.retailRevenuePaise)],
    ["B2B revenue", rup(p.b2bRevenuePaise)],
    ["Revenue", rup(p.revenuePaise)],
    ["Less: COGS (milk sold, FIFO)", rup(p.cogsPaise)],
    ["Gross profit", `${rup(p.grossProfitPaise)}  (${p.grossMarginPct}%)`],
    ["Less: Expenses", rup(p.expensesPaise)],
    ["Milk sold", `${n2(p.litresSold)} L`],
    ["Milk procured", `${n2(p.litresProcured)} L (${rup(p.procurementCashPaise)} cash)`],
    ["Avg procurement cost", `${rup(p.avgCostPerLitrePaise)}/L`],
  ];
  return {
    type, title: "Milk Profit & Loss Statement", subtitle: `${range} · ${stamp}`, rowCount: rows.length,
    columns: [{ label: "Item" }, { label: "Amount", right: true }],
    rows, totalRow: ["NET PROFIT", `${rup(p.netProfitPaise)}  (${p.netMarginPct}%)`],
  };
}

// ---------------- renderers ----------------
const filenameOf = (r: MilkReport, ext: string) => `DOODLY_Milk_${r.type}_${new Date().toISOString().slice(0, 10)}.${ext}`;
export function milkReportFilename(r: MilkReport, ext: string) { return filenameOf(r, ext); }

export function milkReportCsv(r: MilkReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const head = r.columns.map((c) => c.label);
  const all = [head, ...r.rows, ...(r.totalRow ? [r.totalRow] : [])];
  return all.map((row) => row.map(q).join(",")).join("\r\n");
}

export function milkReportXls(r: MilkReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((cell, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(cell)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((cell, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(cell)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
