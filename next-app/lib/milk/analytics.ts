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
  const [dels, b2bDelivered, settled] = await Promise.all([
    // retail delivery days with milk actually going out
    db.delivery.groupBy({ by: ["date"], where: { date: { gte: since }, status: { notIn: ["FAILED", "SKIPPED"] } }, _count: { _all: true } }),
    // B2B recognised (delivered, not cancelled) orders — bucketed by deliveredAt's IST day, so a
    // B2B-only sales day is flagged for settlement too (previously the net saw only retail).
    db.businessOrder.findMany({ where: { deliveredAt: { gte: since }, revenuePaise: { not: null }, status: { not: "CANCELLED" } }, select: { deliveredAt: true }, take: 10000 }),
    // days that already have consumption recorded
    db.tankerConsumption.groupBy({ by: ["date"], where: { date: { gte: since } } }),
  ]);
  const settledDays = new Set(settled.map((s) => istISO(s.date)));
  const salesByDay = new Map<string, number>();
  for (const d of dels) { const k = istISO(d.date); salesByDay.set(k, (salesByDay.get(k) ?? 0) + d._count._all); }
  for (const o of b2bDelivered) { if (!o.deliveredAt) continue; const k = istISO(o.deliveredAt); salesByDay.set(k, (salesByDay.get(k) ?? 0) + 1); }
  const unsettled = [...salesByDay.entries()]
    .filter(([date]) => !settledDays.has(date))
    .map(([date, deliveries]) => ({ date, deliveries }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { healthy: unsettled.length === 0, unsettled, checkedDays: salesByDay.size };
}
