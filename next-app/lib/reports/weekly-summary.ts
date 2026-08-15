/* =============================================================
   DOODLY — Weekly business-summary engine (pure reads).
   Aggregates the last 7 COMPLETE IST days of real business results straight from
   the DB — revenue/profit, orders, new customers, subscriptions, deliveries, top
   products, wallet recharges — plus week-over-week deltas, for the weekly owner
   email. Revenue/profit come from rangePnl (the SAME single-truth engine the admin
   Reports + Profit-Centre use), so this can never disagree with them. GA is for
   traffic; DOODLY's backend stays the source of truth for money. No PII.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { rangePnl } from "@/lib/milk/pnl";
import { retailRevenueForDay } from "@/lib/delivery/revenue";

/** Shift an IST calendar date (YYYY-MM-DD) by whole days. */
function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const pct = (cur: number, prev: number): number => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0);

export interface WeeklySummary {
  fromIso: string; toIso: string; generatedAtIso: string;   // the 7-day IST window (inclusive)
  revenue: { totalPaise: number; retailPaise: number; b2bPaise: number; grossProfitPaise: number | null; netProfitPaise: number | null };
  orders: { paidCount: number; paidValuePaise: number };
  customers: { new: number; total: number };
  subscriptions: { new: number; active: number };
  deliveries: { completed: number; bottlesOut: number; bottlesIn: number };
  wallet: { rechargeCount: number; rechargePaise: number };
  topProducts: { name: string; qty: number; revenuePaise: number }[];
  delta: { revenuePct: number; ordersPct: number; customersPct: number };
}

/** The weekly business summary for the 7 complete IST days ending YESTERDAY of `anchorIso`
 *  (default: today IST — so a scheduled morning send covers the previous full week). */
export async function weeklySummary(anchorIso?: string): Promise<WeeklySummary> {
  const anchor = anchorIso && /^\d{4}-\d{2}-\d{2}$/.test(anchorIso) ? anchorIso : istDayWindow().iso;
  const fromIso = shiftIso(anchor, -7), toIso = shiftIso(anchor, -1);            // last 7 complete days
  const pFromIso = shiftIso(anchor, -14), pToIso = shiftIso(anchor, -8);         // the 7 days before that
  const start = istDayWindow(fromIso).start, end = istDayWindow(toIso).end;
  const pStart = istDayWindow(pFromIso).start, pEnd = istDayWindow(pToIso).end;

  const [pnl, pPnl, orders, newCust, totalCust, newSubs, activeSubs, delAgg, wallet, topProducts, pOrders, pNewCust] = await Promise.all([
    rangePnl(fromIso, toIso).catch(() => null),
    rangePnl(pFromIso, pToIso).catch(() => null),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: start, lt: end } }, _count: true, _sum: { totalPaise: true } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: start, lt: end } } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.subscription.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.delivery.aggregate({ where: { status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] }, date: { gte: start, lt: end } }, _count: true, _sum: { bottlesOut: true, bottlesIn: true } }),
    db.walletTxn.aggregate({ where: { type: "CREDIT", kind: "topup", createdAt: { gte: start, lt: end } }, _count: true, _sum: { amountPaise: true } }),
    db.orderItem.groupBy({ by: ["productName"], where: { order: { status: "PAID", createdAt: { gte: start, lt: end } } }, _sum: { quantity: true, lineTotalPaise: true }, orderBy: { _sum: { lineTotalPaise: "desc" } }, take: 5 }),
    db.order.count({ where: { status: "PAID", createdAt: { gte: pStart, lt: pEnd } } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: pStart, lt: pEnd } } }),
  ]);

  // Revenue/profit from the single-truth P&L engine; fall back to retail-delivered revenue if it errors.
  const totalPaise = pnl ? pnl.revenuePaise : (await retailRevenueForDay(start, end).catch(() => ({ revenuePaise: 0 }))).revenuePaise;
  const pRevenuePaise = pPnl ? pPnl.revenuePaise : 0;

  return {
    fromIso, toIso, generatedAtIso: istDayWindow().iso,
    revenue: {
      totalPaise,
      retailPaise: pnl ? pnl.retailRevenuePaise : totalPaise,
      b2bPaise: pnl ? pnl.b2bRevenuePaise : 0,
      grossProfitPaise: pnl ? pnl.grossProfitPaise : null,
      netProfitPaise: pnl ? pnl.netProfitPaise : null,
    },
    orders: { paidCount: orders._count, paidValuePaise: orders._sum.totalPaise ?? 0 },
    customers: { new: newCust, total: totalCust },
    subscriptions: { new: newSubs, active: activeSubs },
    deliveries: { completed: delAgg._count, bottlesOut: delAgg._sum.bottlesOut ?? 0, bottlesIn: delAgg._sum.bottlesIn ?? 0 },
    wallet: { rechargeCount: wallet._count, rechargePaise: wallet._sum.amountPaise ?? 0 },
    topProducts: topProducts.map((p) => ({ name: p.productName, qty: p._sum.quantity ?? 0, revenuePaise: p._sum.lineTotalPaise ?? 0 })),
    delta: { revenuePct: pct(totalPaise, pRevenuePaise), ordersPct: pct(orders._count, pOrders), customersPct: pct(newCust, pNewCust) },
  };
}

/** Shape the summary into the plain data the weekly-summary email template consumes
 *  (human date labels + flattened week-over-week deltas). Structurally matches
 *  T.WeeklySummaryData in lib/email/templates. */
export function toEmailData(s: WeeklySummary) {
  const fmt = (iso: string) => { try { return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return iso; } };
  return {
    fromLabel: fmt(s.fromIso), toLabel: fmt(s.toIso),
    revenue: { ...s.revenue, deltaPct: s.delta.revenuePct },
    orders: { ...s.orders, deltaPct: s.delta.ordersPct },
    customers: { ...s.customers, deltaPct: s.delta.customersPct },
    subscriptions: s.subscriptions, deliveries: s.deliveries, wallet: s.wallet, topProducts: s.topProducts,
  };
}
