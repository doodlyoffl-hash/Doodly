/* =============================================================
   DOODLY — Milk Profit & Loss.
   Combines the three real ledgers over a period:
     Revenue = retail (completed DELIVERIES on the day, frozen per delivery) + B2B
     COGS    = FIFO milk consumed (TankerConsumption.costPaise)  ← follows sales
     Expenses= Expense.totalPaise (not rejected/cancelled)
     Gross   = Revenue − COGS       Net = Revenue − COGS − Expenses

   COGS is the FIFO cost of milk SOLD in the period (not cash spent buying
   tankers) — that is what makes carry-forward meaningful: a tanker bought today
   but sold over three days is expensed as it sells. The cash spent on tankers is
   reported separately as `procurementCashPaise`.

   Revenue recognition: retail revenue is DELIVERY-based — recognised only when
   milk is delivered (lib/delivery/revenue.retailRevenueForDay: sum of each
   completed delivery's frozen revenuePaise, DELIVERED + PARTIALLY_DELIVERED). A
   prepaid subscription is recognised one delivery-day at a time, matching how COGS
   already spreads across delivery days — no more order-time lumpiness. B2B is
   already delivery-dated (BusinessOrder.deliveryDate). Coupon is netted out and
   the refundable deposit is excluded; wallet stays in. All paise.
   Revenue reads Delivery rows LIVE (needs no settlement). COGS/inventory now draw
   AUTOMATICALLY the moment a delivery completes (completeDelivery → settleDay, quiet +
   idempotent), so a delivered day carries its FIFO COGS without a manual settle. The
   manual "Settle" + settlement-health banner remain the safety net for older days and
   for reconciling a day whose deliveries changed after completion.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { retailRevenueForDay } from "@/lib/delivery/revenue";
import { retailLitresForDay, b2bLitresForDay } from "@/lib/milk/settle";

const IST_MS = 5.5 * 60 * 60 * 1000;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export interface Pnl {
  label: string;
  from: string;                 // IST YYYY-MM-DD inclusive
  toExclusive: string;          // IST YYYY-MM-DD exclusive
  revenuePaise: number;
  retailRevenuePaise: number;
  b2bRevenuePaise: number;
  cogsPaise: number;            // FIFO cost of milk sold
  expensesPaise: number;
  grossProfitPaise: number;     // revenue − COGS
  netProfitPaise: number;       // revenue − COGS − expenses
  grossMarginPct: number;
  netMarginPct: number;
  // operational context (not part of the P&L identity)
  litresSold: number;           // milk consumed (retail + B2B), from the settled COGS ledger
  retailLitresDelivered: number; // retail litres that actually went out (delivered), independent of settlement
  retailDeliveries: number;      // count of completed retail deliveries recognised
  retailCustomersServed: number; // distinct customers with a completed delivery
  retailOrders: number;          // distinct retail fulfilment sources (order / subscription) delivered
  b2bDeliveries: number;         // count of B2B orders recognised (delivered) in the period
  b2bBusinessesServed: number;   // distinct businesses served (delivered) in the period
  b2bLitresDelivered: number;    // B2B milk-equivalent litres delivered (KG→L converted)
  totalMilkLitresDelivered: number; // retail + B2B litres delivered
  procurementCashPaise: number; // cash spent buying tankers in the period
  litresProcured: number;
  kgProcured: number;
  avgCostPerLitrePaise: number; // procurement cash / litres procured
}

export async function pnlForBounds(label: string, start: Date, end: Date): Promise<Pnl> {
  const [retailRev, retailLitres, retailRows, b2bDelivered, b2bAdj, b2bBiz, b2bLitres, cogs, expenses, proc] = await Promise.all([
    retailRevenueForDay(start, end),                              // DELIVERY-based retail revenue (frozen per delivery)
    retailLitresForDay(start, end),                              // retail litres actually delivered (same DELIVERED predicate)
    // delivered retail rows → distinct customers + fulfilment sources (orders/subscriptions)
    db.delivery.findMany({ where: { date: { gte: start, lt: end }, kind: "DELIVERY", status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } }, select: { userId: true, orderId: true, subscriptionId: true, subscription: { select: { userId: true } }, order: { select: { userId: true } } }, take: 8000 }),
    // B2B revenue is now DELIVERY-based + frozen (net of GST): the sum of each order's
    // revenuePaise stamped when it was marked DELIVERED, attributed to deliveredAt's day.
    // A pending/confirmed order (revenuePaise = null) books nothing.
    db.businessOrder.aggregate({ where: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } }, _sum: { revenuePaise: true }, _count: true }),
    // immutable post-delivery reversals (cancellations/refunds) effective in the window —
    // subtracted here rather than editing the frozen order, so history stays intact.
    db.businessRevenueAdjustment.aggregate({ where: { effectiveOn: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
    // distinct businesses served (delivered) in the window
    db.businessOrder.groupBy({ by: ["businessId"], where: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } } }),
    b2bLitresForDay(start, end),                                 // B2B milk-equiv litres delivered (same delivered basis as COGS)
    db.tankerConsumption.aggregate({ where: { date: { gte: start, lt: end } }, _sum: { costPaise: true, litres: true } }),
    db.expense.aggregate({ where: { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] }, date: { gte: start, lt: end } }, _sum: { totalPaise: true } }),
    db.milkTanker.aggregate({ where: { deletedAt: null, procurementDate: { gte: start, lt: end } }, _sum: { totalCostPaise: true, litres: true, quantityKg: true } }),
  ]);

  const retailRevenuePaise = Math.max(0, retailRev.revenuePaise);
  // net of adjustments (may reduce the window's B2B revenue when a prior delivery is reversed)
  const b2bRevenuePaise = (b2bDelivered._sum.revenuePaise ?? 0) - (b2bAdj._sum.amountPaise ?? 0);
  const revenuePaise = retailRevenuePaise + b2bRevenuePaise;
  // distinct retail customers + fulfilment sources delivered
  const custSet = new Set<string>(), orderSet = new Set<string>();
  for (const d of retailRows) {
    const uid = d.userId ?? d.subscription?.userId ?? d.order?.userId; if (uid) custSet.add(uid);
    const oid = d.orderId ?? d.subscriptionId; if (oid) orderSet.add(oid);
  }
  const cogsPaise = cogs._sum.costPaise ?? 0;
  const expensesPaise = expenses._sum.totalPaise ?? 0;
  const grossProfitPaise = revenuePaise - cogsPaise;
  const netProfitPaise = grossProfitPaise - expensesPaise;
  const litresProcured = proc._sum.litres ?? 0;
  const procurementCashPaise = proc._sum.totalCostPaise ?? 0;

  return {
    label,
    from: istDate(start),
    toExclusive: istDate(end),
    revenuePaise, retailRevenuePaise, b2bRevenuePaise,
    cogsPaise, expensesPaise, grossProfitPaise, netProfitPaise,
    grossMarginPct: pct(grossProfitPaise, revenuePaise),
    netMarginPct: pct(netProfitPaise, revenuePaise),
    litresSold: Math.round((cogs._sum.litres ?? 0) * 100) / 100,
    retailLitresDelivered: Math.round(retailLitres * 100) / 100,
    retailDeliveries: retailRev.deliveries,
    retailCustomersServed: custSet.size,
    retailOrders: orderSet.size,
    b2bDeliveries: b2bDelivered._count,
    b2bBusinessesServed: b2bBiz.length,
    b2bLitresDelivered: Math.round(b2bLitres * 100) / 100,
    totalMilkLitresDelivered: Math.round((retailLitres + b2bLitres) * 100) / 100,
    procurementCashPaise, litresProcured: Math.round(litresProcured * 100) / 100,
    kgProcured: Math.round((proc._sum.quantityKg ?? 0) * 100) / 100,
    avgCostPerLitrePaise: litresProcured > 0 ? Math.round(procurementCashPaise / litresProcured) : 0,
  };
}

const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

/** P&L for one IST day. */
export function dailyPnl(dateIso?: string | null): Promise<Pnl> {
  const { start, end, iso } = istDayWindow(dateIso);
  return pnlForBounds(iso, start, end);
}

/** P&L over an arbitrary IST date range [fromIso, toIso] inclusive. */
export function rangePnl(fromIso: string, toIso: string): Promise<Pnl> {
  const start = istDayWindow(fromIso).start;
  const end = istDayWindow(toIso).end;   // inclusive of the `to` day
  return pnlForBounds(`${fromIso} → ${toIso}`, start, end);
}

/** P&L for an IST calendar month. `ym` = "YYYY-MM" (default: current IST month). */
export function monthlyPnl(ym?: string | null): Promise<Pnl> {
  const now = new Date(Date.now() + IST_MS);
  const y = ym && /^\d{4}-\d{2}$/.test(ym) ? Number(ym.slice(0, 4)) : now.getUTCFullYear();
  const m = ym && /^\d{4}-\d{2}$/.test(ym) ? Number(ym.slice(5, 7)) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - IST_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - IST_MS);
  const label = `${y}-${String(m + 1).padStart(2, "0")}`;
  return pnlForBounds(label, start, end);
}
