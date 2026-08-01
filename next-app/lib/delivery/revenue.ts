/* =============================================================
   DOODLY — Delivery-based retail revenue recognition.
   Retail revenue is EARNED on delivery, not at order/prepay time. This is the
   single source that values one completed retail delivery and sums a day's worth.
     • subscription delivery → Σ(item.qty × Variant.dailyPaise) × (1 − plan.discountBps)
       — the same per-delivery figure lib/billing/service.ts uses (live dailyPaise).
     • one-time order (exactly 1 delivery) → totalPaise − coupon − deposit (deposit is
       a refundable liability, stripped so it matches the subscription basis).
     • pickup / no sub+order → ₹0.
     • PARTIALLY_DELIVERED → pro-rated by bottlesOut / bottleCount.
   completeDelivery FREEZES this onto Delivery.revenuePaise at completion (so a later
   price change never re-values a past day). retailRevenueForDay prefers the frozen
   snapshot and falls back to computing live for any un-stamped row.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface DeliveryRevenueInput {
  status: string;
  kind?: string | null;
  bottleCount?: number | null;
  bottlesOut?: number | null;
  subscription?: { plan?: { discountBps: number } | null; items: { qty: number; variant?: { dailyPaise: number | null } | null }[] } | null;
  order?: { totalPaise: number; couponDiscountPaise?: number | null; depositPaise?: number | null } | null;
}

/** Recognised retail revenue (paise) of ONE completed delivery — pure, frozen at completion. */
export function computeDeliveryRevenuePaise(row: DeliveryRevenueInput): number {
  if (row.kind === "PICKUP") return 0;                       // a pickup collects empties — no milk revenue
  let full: number;
  if (row.subscription) {
    const gross = (row.subscription.items || []).reduce((s, it) => s + (it.qty || 0) * (it.variant?.dailyPaise ?? 0), 0);
    const discountBps = row.subscription.plan?.discountBps ?? 0;
    full = Math.round(gross * (1 - discountBps / 10000));
  } else if (row.order) {
    full = Math.max(0, (row.order.totalPaise ?? 0) - (row.order.couponDiscountPaise ?? 0) - (row.order.depositPaise ?? 0));
  } else {
    return 0;
  }
  // partial hand-over → pro-rate by the fraction of bottles actually delivered
  if (row.status === "PARTIALLY_DELIVERED") {
    const bc = row.bottleCount ?? 0;
    return bc > 0 ? Math.round(full * Math.min(1, Math.max(0, (row.bottlesOut ?? 0) / bc))) : 0;
  }
  return full;
}

/** The Prisma select that feeds computeDeliveryRevenuePaise + the frozen snapshot. */
export const DELIVERY_REVENUE_SELECT = {
  status: true, kind: true, bottleCount: true, bottlesOut: true, revenuePaise: true,
  subscription: { select: { plan: { select: { discountBps: true } }, items: { select: { qty: true, variant: { select: { dailyPaise: true } } } } } },
  order: { select: { totalPaise: true, couponDiscountPaise: true, depositPaise: true } },
} as const;

/** Total recognised retail revenue for the IST window — DELIVERED + PARTIALLY_DELIVERED
 *  only. Uses the frozen Delivery.revenuePaise when present, else computes live. */
export async function retailRevenueForDay(start: Date, end: Date): Promise<{ revenuePaise: number; deliveries: number }> {
  const rows = await db.delivery.findMany({
    where: { date: { gte: start, lt: end }, status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } },
    select: DELIVERY_REVENUE_SELECT,
    take: 20000,
  });
  let revenuePaise = 0;
  for (const r of rows) revenuePaise += r.revenuePaise ?? computeDeliveryRevenuePaise(r as DeliveryRevenueInput);
  return { revenuePaise, deliveries: rows.length };
}
