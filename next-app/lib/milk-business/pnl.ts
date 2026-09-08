/* =============================================================
   PRIVATE Milk-Business P&L  (spec §25/§29).
     Revenue = B2B (delivered, net GST) + Warehouse walk-in + Retail Outlet
     COGS    = FIFO cost of milk sold through THOSE channels only
               (TankerConsumption where channel ∈ {B2B, WAREHOUSE, OUTLET})
     Expenses= date-based Expense.totalPaise (not rejected/cancelled), MILK-SCOPED
               — only categories with slug prefix `milk-business-` (see ./expenses),
               so retail/general expenses booked elsewhere are NOT subtracted here.
     Gross   = Revenue − COGS      Net = Gross − Expenses
   This is a DISTINCT lens from the public Profit Center (which is home-delivery
   + B2B); it deliberately EXCLUDES the consumer home-delivery channel. B2B is
   shared by both lenses (not double-counted within a lens). All money paise.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { b2bLitresForDay, warehouseLitresForDay, outletLitresForDay } from "@/lib/milk/settle";
import { isMilkSlug } from "@/lib/b2b/units";
import { MILK_EXPENSE_SLUG_PREFIX } from "./expenses";

const IST_MS = 5.5 * 60 * 60 * 1000;
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

export interface MbPnl {
  label: string; from: string; toExclusive: string;
  b2bRevenuePaise: number; warehouseRevenuePaise: number; outletRevenuePaise: number; revenuePaise: number;
  cogsPaise: number; expensesPaise: number; grossProfitPaise: number; netProfitPaise: number;
  grossMarginPct: number; netMarginPct: number;
  litresSold: number;            // milk drawn FIFO for these channels (from the COGS ledger)
  b2bLitres: number; b2bKg: number; warehouseLitres: number; outletLitres: number;
  b2bOrders: number; b2bBusinesses: number; warehouseSales: number; outletSales: number;
  avgB2bPricePerKgPaise: number; avgWarehousePricePerLitrePaise: number;
}

export async function mbPnlForBounds(label: string, start: Date, end: Date): Promise<MbPnl> {
  const [b2bDelivered, b2bAdj, b2bBiz, wh, outlet, cogs, exp, b2bItems, b2bLitres, whLitres, outletLitres] = await Promise.all([
    db.businessOrder.aggregate({ where: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } }, _sum: { revenuePaise: true }, _count: true }),
    db.businessRevenueAdjustment.aggregate({ where: { effectiveOn: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
    db.businessOrder.groupBy({ by: ["businessId"], where: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } } }),
    db.warehouseSale.aggregate({ where: { status: "COMPLETED", saleDate: { gte: start, lt: end } }, _sum: { netPaise: true, litres: true }, _count: true }),
    db.outletSale.aggregate({ where: { status: "COMPLETED", saleDate: { gte: start, lt: end } }, _sum: { netPaise: true, litres: true }, _count: true }),
    // COGS + drawn litres for the private channels only
    db.tankerConsumption.aggregate({ where: { date: { gte: start, lt: end }, channel: { in: ["B2B", "WAREHOUSE", "OUTLET"] } }, _sum: { costPaise: true, litres: true } }),
    db.expense.aggregate({ where: { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] }, date: { gte: start, lt: end }, category: { slug: { startsWith: MILK_EXPENSE_SLUG_PREFIX } } }, _sum: { totalPaise: true } }),
    // B2B milk KG sold (for the "B2B KG Sold" KPI) — milk lines billed in KG
    db.businessOrderItem.findMany({ where: { order: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } } }, select: { unit: true, quantity: true, productSlug: true }, take: 8000 }),
    b2bLitresForDay(start, end),
    warehouseLitresForDay(start, end),
    outletLitresForDay(start, end),
  ]);

  const b2bRevenuePaise = (b2bDelivered._sum.revenuePaise ?? 0) - (b2bAdj._sum.amountPaise ?? 0);
  const warehouseRevenuePaise = wh._sum.netPaise ?? 0;
  const outletRevenuePaise = outlet._sum.netPaise ?? 0;
  const revenuePaise = b2bRevenuePaise + warehouseRevenuePaise + outletRevenuePaise;
  const cogsPaise = cogs._sum.costPaise ?? 0;
  const expensesPaise = exp._sum.totalPaise ?? 0;
  const grossProfitPaise = revenuePaise - cogsPaise;
  const netProfitPaise = grossProfitPaise - expensesPaise;

  let b2bKg = 0;
  for (const it of b2bItems) if (isMilkSlug(it.productSlug) && it.unit === "KG") b2bKg += it.quantity;

  return {
    label, from: istDate(start), toExclusive: istDate(end),
    b2bRevenuePaise, warehouseRevenuePaise, outletRevenuePaise, revenuePaise,
    cogsPaise, expensesPaise, grossProfitPaise, netProfitPaise,
    grossMarginPct: pct(grossProfitPaise, revenuePaise), netMarginPct: pct(netProfitPaise, revenuePaise),
    litresSold: r2(cogs._sum.litres ?? 0),
    b2bLitres: r2(b2bLitres), b2bKg: r2(b2bKg), warehouseLitres: r2(whLitres), outletLitres: r2(outletLitres),
    b2bOrders: b2bDelivered._count, b2bBusinesses: b2bBiz.length, warehouseSales: wh._count, outletSales: outlet._count,
    avgB2bPricePerKgPaise: b2bKg > 0 ? Math.round(b2bRevenuePaise / b2bKg) : 0,
    avgWarehousePricePerLitrePaise: (wh._sum.litres ?? 0) > 0 ? Math.round(warehouseRevenuePaise / (wh._sum.litres ?? 1)) : 0,
  };
}

export function mbDailyPnl(dateIso?: string | null): Promise<MbPnl> {
  const { start, end, iso } = istDayWindow(dateIso);
  return mbPnlForBounds(iso, start, end);
}

export function mbRangePnl(fromIso: string, toIso: string): Promise<MbPnl> {
  const start = istDayWindow(fromIso).start;
  const end = istDayWindow(toIso).end;
  return mbPnlForBounds(`${fromIso} → ${toIso}`, start, end);
}

export function mbMonthlyPnl(ym?: string | null): Promise<MbPnl> {
  const now = new Date(Date.now() + IST_MS);
  const y = ym && /^\d{4}-\d{2}$/.test(ym) ? Number(ym.slice(0, 4)) : now.getUTCFullYear();
  const m = ym && /^\d{4}-\d{2}$/.test(ym) ? Number(ym.slice(5, 7)) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - IST_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - IST_MS);
  return mbPnlForBounds(`${y}-${String(m + 1).padStart(2, "0")}`, start, end);
}
