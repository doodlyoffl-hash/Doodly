/* =============================================================
   Private Milk-Business — walk-in retail channel aggregates for the
   Control Centre dashboard (warehouse now; outlet in Phase 2).
   Revenue = Σ frozen netPaise of COMPLETED sales in the IST window;
   litres = Σ sale litres. All money paise.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export type ChannelSales = { revenuePaise: number; litres: number; count: number };

/** Warehouse walk-in retail sales over [start, end). */
export async function warehouseSalesForRange(start: Date, end: Date): Promise<ChannelSales> {
  const r = await db.warehouseSale.aggregate({
    where: { status: "COMPLETED", saleDate: { gte: start, lt: end } },
    _sum: { netPaise: true, litres: true },
    _count: true,
  });
  return { revenuePaise: r._sum.netPaise ?? 0, litres: Math.round((r._sum.litres ?? 0) * 100) / 100, count: r._count };
}

/** Retail-outlet sales over [start, end). */
export async function outletSalesForRange(start: Date, end: Date): Promise<ChannelSales> {
  const r = await db.outletSale.aggregate({
    where: { status: "COMPLETED", saleDate: { gte: start, lt: end } },
    _sum: { netPaise: true, litres: true },
    _count: true,
  });
  return { revenuePaise: r._sum.netPaise ?? 0, litres: Math.round((r._sum.litres ?? 0) * 100) / 100, count: r._count };
}
