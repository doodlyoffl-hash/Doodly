/* =============================================================
   DOODLY — B2B Sales Report + unit analytics (by product × unit).
   B2B sales over an IST range grouped by (product, unit) — quantity, revenue,
   average selling price (ASP = revenue / qty), and for MILK the litres-equivalent
   drawn + allocated COGS + profit. COGS is allocated at the period's *blended*
   cost-per-litre (Σ TankerConsumption.costPaise ÷ Σ litres) applied to each milk
   group's litres-equiv — the same FIFO cost the P&L uses, split by volume. Non-milk
   (solids) COGS is not tracked yet (milk-only), shown as "—". Normalised
   {columns,rows,totalRow} → the shared renderMilkReportPdf / CSV / XLS pipeline.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { getMilkConfig } from "@/lib/milk/config";
import { saleLitres, isMilkSlug, isKgUnit, isLitreUnit } from "@/lib/b2b/units";

const rup = (p: number) => "₹" + Math.round((p || 0) / 100).toLocaleString("en-IN");
const n2 = (x: number) => (Math.round((x || 0) * 100) / 100).toLocaleString("en-IN");
const dmy = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

export interface B2BSalesRow {
  productSlug: string; productName: string; unit: string; isMilk: boolean;
  quantity: number; revenuePaise: number; aspPaise: number;
  litresEquiv: number; cogsPaise: number | null; profitPaise: number | null;
}
export interface UnitAnalytic { unit: string; quantity: number; revenuePaise: number; aspPaise: number; cogsPaise: number | null; profitPaise: number | null; }

export interface B2BSalesReport {
  type: string; title: string; subtitle: string; rowCount: number;
  columns: { label: string; right?: boolean }[]; rows: string[][]; totalRow?: string[];
  data: B2BSalesRow[];
  analytics: {
    from: string; to: string;
    revenuePaise: number; cogsPaise: number; profitPaise: number;
    milkRevenuePaise: number; solidsRevenuePaise: number;
    byUnit: UnitAnalytic[];
    kgRevenuePaise: number; litreRevenuePaise: number;
    aspPerKgPaise: number | null; aspPerLitrePaise: number | null;
    kgCustomerRevenuePaise: number; litreCustomerRevenuePaise: number;
  };
}

export async function b2bSalesReport(fromIso: string, toIso: string): Promise<B2BSalesReport> {
  const start = istDayWindow(fromIso).start;
  const end = istDayWindow(toIso).end;
  const [orders, consumption, cfg] = await Promise.all([
    db.businessOrder.findMany({
      where: { deliveryDate: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      select: { items: { select: { productSlug: true, productName: true, quantity: true, unit: true, lineTotalPaise: true } } },
      take: 20000,
    }),
    db.tankerConsumption.aggregate({ where: { date: { gte: start, lt: end } }, _sum: { costPaise: true, litres: true } }),
    getMilkConfig(),
  ]);
  const totalCogsPaise = consumption._sum.costPaise ?? 0;
  const totalLitres = consumption._sum.litres ?? 0;
  const costPerLitrePaise = totalLitres > 0 ? totalCogsPaise / totalLitres : 0;   // blended period allocation basis

  type G = { productSlug: string; productName: string; unit: string; quantity: number; revenuePaise: number; litresEquiv: number };
  const groups = new Map<string, G>();
  for (const o of orders) for (const it of o.items) {
    const key = `${it.productName}||${it.unit}`;
    let g = groups.get(key);
    if (!g) { g = { productSlug: it.productSlug, productName: it.productName, unit: it.unit, quantity: 0, revenuePaise: 0, litresEquiv: 0 }; groups.set(key, g); }
    g.quantity += it.quantity;
    g.revenuePaise += it.lineTotalPaise;
    g.litresEquiv += saleLitres({ productSlug: it.productSlug, unit: it.unit, quantity: it.quantity }, cfg.conversionFactor);
  }

  const data: B2BSalesRow[] = [...groups.values()].map((g) => {
    const milk = isMilkSlug(g.productSlug);
    const cogsPaise = milk ? Math.round(g.litresEquiv * costPerLitrePaise) : null;
    return {
      productSlug: g.productSlug, productName: g.productName, unit: g.unit, isMilk: milk,
      quantity: Math.round(g.quantity * 100) / 100, revenuePaise: g.revenuePaise,
      aspPaise: g.quantity > 0 ? Math.round(g.revenuePaise / g.quantity) : 0,
      litresEquiv: Math.round(g.litresEquiv * 100) / 100,
      cogsPaise, profitPaise: cogsPaise == null ? null : g.revenuePaise - cogsPaise,
    };
  }).sort((a, b) => b.revenuePaise - a.revenuePaise);

  // ---- analytics ----
  const sum = (f: (r: B2BSalesRow) => number) => data.reduce((s, r) => s + f(r), 0);
  const revenuePaise = sum((r) => r.revenuePaise);
  const cogsPaise = sum((r) => r.cogsPaise ?? 0);
  const milkRevenuePaise = sum((r) => (r.isMilk ? r.revenuePaise : 0));
  const solidsRevenuePaise = revenuePaise - milkRevenuePaise;
  // by unit (across products)
  const uMap = new Map<string, { quantity: number; revenuePaise: number; cogsPaise: number; hasCogs: boolean }>();
  for (const r of data) {
    const u = uMap.get(r.unit) ?? { quantity: 0, revenuePaise: 0, cogsPaise: 0, hasCogs: false };
    u.quantity += r.quantity; u.revenuePaise += r.revenuePaise;
    if (r.cogsPaise != null) { u.cogsPaise += r.cogsPaise; u.hasCogs = true; }
    uMap.set(r.unit, u);
  }
  const byUnit: UnitAnalytic[] = [...uMap.entries()].map(([unit, u]) => ({
    unit, quantity: Math.round(u.quantity * 100) / 100, revenuePaise: u.revenuePaise,
    aspPaise: u.quantity > 0 ? Math.round(u.revenuePaise / u.quantity) : 0,
    cogsPaise: u.hasCogs ? u.cogsPaise : null, profitPaise: u.hasCogs ? u.revenuePaise - u.cogsPaise : null,
  })).sort((a, b) => b.revenuePaise - a.revenuePaise);
  const kgRevenuePaise = sum((r) => (isKgUnit(r.unit) ? r.revenuePaise : 0));
  const litreRevenuePaise = sum((r) => (isLitreUnit(r.unit) ? r.revenuePaise : 0));
  const kgQty = sum((r) => (isKgUnit(r.unit) ? r.quantity : 0));
  const litreQty = sum((r) => (isLitreUnit(r.unit) ? r.quantity : 0));

  // ---- normalised table ----
  const columns = [
    { label: "Product" }, { label: "Unit" }, { label: "Qty", right: true }, { label: "Revenue", right: true },
    { label: "ASP / unit", right: true }, { label: "Litres (milk)", right: true }, { label: "COGS", right: true }, { label: "Profit", right: true },
  ];
  const rows = data.map((r) => [
    r.productName, r.unit, n2(r.quantity), rup(r.revenuePaise), rup(r.aspPaise),
    r.isMilk ? n2(r.litresEquiv) : "—", r.cogsPaise == null ? "—" : rup(r.cogsPaise), r.profitPaise == null ? "—" : rup(r.profitPaise),
  ]);
  const totalRow = [
    "TOTAL", `${data.length} line(s)`, "", rup(revenuePaise), "", n2(sum((r) => r.litresEquiv)), rup(cogsPaise), rup(revenuePaise - cogsPaise),
  ];

  return {
    type: "b2bSales",
    title: "B2B Sales Report (by unit)",
    subtitle: `${dmy(fromIso)} → ${dmy(toIso)} · ${rup(revenuePaise)} revenue · ${rup(cogsPaise)} milk COGS · ${rup(revenuePaise - cogsPaise)} profit · KG ${rup(kgRevenuePaise)} vs Litre ${rup(litreRevenuePaise)} · non-milk COGS not tracked (milk-only) · generated ${new Date().toLocaleString("en-IN")}`,
    rowCount: data.length,
    columns, rows, totalRow, data,
    analytics: {
      from: fromIso, to: toIso, revenuePaise, cogsPaise, profitPaise: revenuePaise - cogsPaise,
      milkRevenuePaise, solidsRevenuePaise, byUnit,
      kgRevenuePaise, litreRevenuePaise,
      aspPerKgPaise: kgQty > 0 ? Math.round(kgRevenuePaise / kgQty) : null,
      aspPerLitrePaise: litreQty > 0 ? Math.round(litreRevenuePaise / litreQty) : null,
      kgCustomerRevenuePaise: kgRevenuePaise, litreCustomerRevenuePaise: litreRevenuePaise,
    },
  };
}

// ---------- exports ----------
export function b2bSalesReportFilename(from: string, to: string, ext: string) { return `DOODLY_B2B_Sales_${from}_to_${to}.${ext}`; }

export function b2bSalesReportCsv(r: B2BSalesReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const head = r.columns.map((c) => c.label);
  return [head, ...r.rows, ...(r.totalRow ? [r.totalRow] : [])].map((row) => row.map(q).join(",")).join("\r\n");
}

export function b2bSalesReportXls(r: B2BSalesReport): string {
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const th = r.columns.map((c) => `<th style="background:#E4F6EC;border:1px solid #ccc;padding:6px 8px;text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = r.rows.map((row) => "<tr>" + row.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>").join("");
  const tot = r.totalRow ? "<tr>" + r.totalRow.map((c, i) => `<td style="border:1px solid #ccc;padding:6px 8px;font-weight:700;background:#F6FAF6;text-align:${r.columns[i]?.right ? "right" : "left"}">${esc(c)}</td>`).join("") + "</tr>" : "";
  return `<html><head><meta charset="utf-8"></head><body>
<h3>DOODLY — ${esc(r.title)}</h3><p>${esc(r.subtitle)}</p>
<table><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table></body></html>`;
}
