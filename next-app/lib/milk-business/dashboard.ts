/* =============================================================
   Private Milk-Business — Control Centre dashboard aggregator.
   COMPOSES existing authoritative engines (never re-computes money):
     - P&L (B2B + Warehouse + Outlet)   → lib/milk-business/pnl  (spec §25/§29)
     - Milk position (all channels)     → lib/milk/inventory  (physical truth)
     - Live inventory (Σ open lots)     → lib/milk/tanker.getInventory
     - Procurement (channel-agnostic)   → milkTanker aggregate
   All money paise; all litres litres.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { mbDailyPnl, mbMonthlyPnl, type MbPnl } from "@/lib/milk-business/pnl";
import { milkInventorySummary } from "@/lib/milk/inventory";
import { getInventory } from "@/lib/milk/tanker";

const IST_MS = 5.5 * 60 * 60 * 1000;
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

async function procurementBlock(start: Date, end: Date) {
  const [agg, count] = await Promise.all([
    db.milkTanker.aggregate({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } }, _sum: { quantityKg: true, litres: true, totalCostPaise: true } }),
    db.milkTanker.count({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } } }),
  ]);
  const litres = agg._sum.litres ?? 0, cost = agg._sum.totalCostPaise ?? 0;
  return { tankersReceived: count, kgProcured: r2(agg._sum.quantityKg ?? 0), litresProcured: r2(litres), totalTankerCostPaise: cost, avgCostPerLitrePaise: litres > 0 ? Math.round(cost / litres) : 0 };
}

function periodBlock(pnl: MbPnl, proc: Awaited<ReturnType<typeof procurementBlock>>) {
  return {
    label: pnl.label,
    procurement: proc,
    sales: {
      b2bRevenuePaise: pnl.b2bRevenuePaise, b2bKg: pnl.b2bKg, b2bLitres: pnl.b2bLitres, b2bOrders: pnl.b2bOrders, b2bBusinesses: pnl.b2bBusinesses,
      warehouseRevenuePaise: pnl.warehouseRevenuePaise, warehouseLitres: pnl.warehouseLitres, warehouseSales: pnl.warehouseSales,
      outletRevenuePaise: pnl.outletRevenuePaise, outletLitres: pnl.outletLitres, outletSales: pnl.outletSales,
      totalRevenuePaise: pnl.revenuePaise,
      avgB2bPricePerKgPaise: pnl.avgB2bPricePerKgPaise, avgWarehousePricePerLitrePaise: pnl.avgWarehousePricePerLitrePaise,
    },
    finance: {
      revenuePaise: pnl.revenuePaise, cogsPaise: pnl.cogsPaise, grossProfitPaise: pnl.grossProfitPaise,
      expensesPaise: pnl.expensesPaise, netProfitPaise: pnl.netProfitPaise,
      grossMarginPct: pnl.grossMarginPct, netMarginPct: pnl.netMarginPct, litresSold: pnl.litresSold,
    },
  };
}

export async function getControlCentre(dateIso?: string | null, ym?: string | null) {
  const day = istDayWindow(dateIso);

  const now = new Date(Date.now() + IST_MS);
  const y = ym && /^\d{4}-\d{2}$/.test(ym) ? Number(ym.slice(0, 4)) : now.getUTCFullYear();
  const mo = ym && /^\d{4}-\d{2}$/.test(ym) ? Number(ym.slice(5, 7)) - 1 : now.getUTCMonth();
  const mStart = new Date(Date.UTC(y, mo, 1) - IST_MS);
  const mEnd = new Date(Date.UTC(y, mo + 1, 1) - IST_MS);

  const [dPnl, mPnl, dInv, live, dProc, mProc] = await Promise.all([
    mbDailyPnl(dateIso),
    mbMonthlyPnl(ym),
    milkInventorySummary(dateIso ?? undefined),
    getInventory(),
    procurementBlock(day.start, day.end),
    procurementBlock(mStart, mEnd),
  ]);

  return {
    date: day.iso,
    month: mPnl.label,
    today: periodBlock(dPnl, dProc),
    month_: periodBlock(mPnl, mProc),
    position: {
      openingLitres: dInv.openingBalance,
      procurementLitres: dInv.procurement,
      freshoutLitres: dInv.freshout,
      totalAvailableLitres: r2(dInv.openingBalance + dInv.procurement + dInv.freshout),
      retailConsumedLitres: dInv.retailConsumed,     // retail-family incl. warehouse/outlet
      b2bConsumedLitres: dInv.b2bConsumed,
      wastageLitres: dInv.wastage,
      totalSoldLitres: r2(dInv.retailConsumed + dInv.b2bConsumed + dInv.wastage),
      closingLitres: dInv.closingBalance,
      currentAvailableLitres: dInv.currentAvailable,
      inventoryValuePaise: dInv.inventoryValuePaise,
      openLots: dInv.openLots,
      reconciled: dInv.reconciled,
    },
    liveInventory: { remainingLitres: live.remainingLitres, remainingValuePaise: live.remainingValuePaise, openCount: live.openCount },
  };
}
