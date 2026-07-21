/* =============================================================
   DOODLY — Milk analytics cards + settlement health.
   Cards feed the Profit Center + the admin dashboard widget. Settlement health
   is the safety net: a delivery day whose milk was never drawn from inventory
   has no COGS, so its profit is silently overstated — surface those days so
   they get settled.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { dailyPnl, monthlyPnl } from "@/lib/milk/pnl";
import { getInventory } from "@/lib/milk/tanker";

const IST = 5.5 * 3600e3;
const istISO = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

export interface MilkCards {
  todayRevenuePaise: number;
  todayNetProfitPaise: number;
  monthRevenuePaise: number;
  monthNetProfitPaise: number;
  monthMilkPurchasedLitres: number;
  monthMilkSoldLitres: number;
  avgProcurementCostPerLitrePaise: number;
  inventoryLitres: number;
  inventoryValuePaise: number;
  netMarginPct: number;
  expensePct: number;   // month expenses as % of month revenue
}

export async function milkCards(): Promise<MilkCards> {
  const [day, month, inv] = await Promise.all([dailyPnl(), monthlyPnl(), getInventory()]);
  return {
    todayRevenuePaise: day.revenuePaise,
    todayNetProfitPaise: day.netProfitPaise,
    monthRevenuePaise: month.revenuePaise,
    monthNetProfitPaise: month.netProfitPaise,
    monthMilkPurchasedLitres: month.litresProcured,
    monthMilkSoldLitres: month.litresSold,
    avgProcurementCostPerLitrePaise: month.avgCostPerLitrePaise,
    inventoryLitres: inv.remainingLitres,
    inventoryValuePaise: inv.remainingValuePaise,
    netMarginPct: month.netMarginPct,
    expensePct: month.revenuePaise > 0 ? Math.round((month.expensesPaise / month.revenuePaise) * 1000) / 10 : 0,
  };
}

export interface SettlementHealth {
  healthy: boolean;
  unsettled: { date: string; deliveries: number }[];   // delivery days with sales but no consumption
  checkedDays: number;
}

/** Delivery days in the last `lookback` days that were NOT settled (no milk drawn).
 *  These days show revenue with no COGS until settled — the thing to catch. */
export async function settlementHealth(lookback = 30): Promise<SettlementHealth> {
  const since = new Date(Date.now() - lookback * 864e5);
  // delivery days with milk actually going out
  const dels = await db.delivery.groupBy({ by: ["date"], where: { date: { gte: since }, status: { notIn: ["FAILED", "SKIPPED"] } }, _count: { _all: true } });
  // days that already have consumption recorded
  const settled = await db.tankerConsumption.groupBy({ by: ["date"], where: { date: { gte: since } } });
  const settledDays = new Set(settled.map((s) => istISO(s.date)));
  const unsettled = dels
    .map((d) => ({ date: istISO(d.date), deliveries: d._count._all }))
    .filter((d) => !settledDays.has(d.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { healthy: unsettled.length === 0, unsettled, checkedDays: dels.length };
}
