/* =============================================================
   DOODLY — Undelivered paid days (fairness reconciliation).

   A subscription delivery can silently pass its date while still SCHEDULED (never
   assigned/delivered/missed). Because SCHEDULED is a COUNTING status, those days count
   toward the paid target, so reconcileSchedule never makes them up — the customer paid
   but got nothing. This module DETECTS those subscriptions and (via the remedy fns) makes
   the customer whole: roll the days forward (reschedule + extend) OR credit the wallet.

   Admin-reviewed: listUndelivered() feeds the review board; an admin applies the remedy.
   ============================================================= */
import "server-only";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { computeDeliveryRevenuePaise, type DeliveryRevenueInput } from "@/lib/delivery/revenue";
import { detachAssignment, reconcileSchedule, reoptimizeAffected } from "./deliveries";
import { adminCredit } from "@/lib/wallet/service";
import { audit } from "@/lib/auth/audit";
import { notify, notifyMissedDeliveryAdjusted } from "@/lib/notifications/dispatch";

interface Actor { actorId?: string; actorRole?: string }

/** Counted-but-not-delivered statuses. A row in one of these whose date has PASSED is an
 *  undelivered paid day (SKIPPED/FAILED/CANCELLED are already resolved; DELIVERED is done). */
export const STALE_UNDELIVERED: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
/** Roll forward when the lapse is this recent (customer likely still engaged); else credit. */
export const STALE_WINDOW_DAYS = 10;

export type Remedy = "rollforward" | "credit";
export interface UndeliveredSub {
  subscriptionId: string;
  code: string;                 // short display id
  customerId: string | null;
  customerName: string;
  planName: string;
  status: string;               // ACTIVE | PAUSED
  undeliveredDays: number;
  valuePaise: number;
  staleDates: string[];         // ISO (YYYY-MM-DD), ascending
  recommendation: Remedy;
  reason: string;
}

const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);   // IST calendar date

/** Fetch every past-dated undelivered delivery for ACTIVE/PAUSED subs, with the fields
 *  needed to value each day + group by subscription. Shared by list + the remedy fns. */
async function fetchStale(where: { subscriptionId?: string } = {}) {
  const todayStart = istDayWindow().start;
  return db.delivery.findMany({
    where: {
      status: { in: STALE_UNDELIVERED },
      date: { lt: todayStart },
      subscriptionId: where.subscriptionId ? where.subscriptionId : { not: null },
      subscription: { status: { in: ["ACTIVE", "PAUSED"] } },
    },
    select: {
      id: true, date: true, subscriptionId: true, driverId: true,
      status: true, kind: true, bottleCount: true, bottlesOut: true, revenuePaise: true,
      order: { select: { totalPaise: true, couponDiscountPaise: true, depositPaise: true } },
      subscription: {
        select: {
          id: true, status: true, userId: true, endDate: true,
          user: { select: { name: true } },
          plan: { select: { name: true, days: true, discountBps: true } },
          items: { select: { qty: true, variant: { select: { dailyPaise: true } } } },
          order: { select: { totalPaise: true, couponDiscountPaise: true, depositPaise: true } },
        },
      },
    },
    orderBy: { date: "asc" },
    take: 20000,
  });
}
type StaleRow = Awaited<ReturnType<typeof fetchStale>>[number];

/** Fair value of the undelivered days for one subscription (paise). Per-day-priced subs use
 *  the dailyPaise revenue basis; a trial (no per-day price) pro-rates the initiating order's
 *  paid-for-milk amount (total − refundable deposit − coupon) across its plan days. */
function valueUndelivered(rows: StaleRow[], sub: NonNullable<StaleRow["subscription"]>): number {
  const dailyBased = rows.reduce((s, r) => s + computeDeliveryRevenuePaise(r as unknown as DeliveryRevenueInput), 0);
  if (dailyBased > 0) return dailyBased;
  const o = sub.order;
  const paid = o ? Math.max(0, (o.totalPaise || 0) - (o.depositPaise || 0) - (o.couponDiscountPaise || 0)) : 0;
  const days = sub.plan?.days || 0;
  return days > 0 ? Math.round((paid * rows.length) / days) : paid;
}

/** Group past-dated undelivered deliveries by subscription. */
function groupBySub(stale: StaleRow[]) {
  const groups = new Map<string, { sub: NonNullable<StaleRow["subscription"]>; rows: StaleRow[] }>();
  for (const d of stale) {
    if (!d.subscriptionId || !d.subscription) continue;
    const g = groups.get(d.subscriptionId) ?? { sub: d.subscription, rows: [] };
    g.rows.push(d);
    groups.set(d.subscriptionId, g);
  }
  return groups;
}

/** Subscriptions (ACTIVE/PAUSED) with ≥1 past-dated undelivered day, valued + with a
 *  recommended remedy. One row per subscription, most days-owed first. */
export async function listUndelivered(): Promise<UndeliveredSub[]> {
  const todayStart = istDayWindow().start;
  const groups = groupBySub(await fetchStale());

  // An admin "dismiss" hides a sub until a NEWER undelivered day appears (dismiss recorded
  // after the latest stale date → covered). Fetch the latest dismissal per candidate sub.
  const subIds = [...groups.keys()];
  const lastDismiss = new Map<string, Date>();
  if (subIds.length) {
    const evs = await db.subscriptionEvent.findMany({ where: { subscriptionId: { in: subIds }, type: "UNDELIVERED_DISMISSED" }, select: { subscriptionId: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    for (const e of evs) if (!lastDismiss.has(e.subscriptionId)) lastDismiss.set(e.subscriptionId, e.createdAt);
  }

  const out: UndeliveredSub[] = [];
  for (const [subId, g] of groups) {
    const dates = g.rows.map((r) => r.date).sort((a, b) => a.getTime() - b.getTime());
    const latest = dates[dates.length - 1];
    const dis = lastDismiss.get(subId);
    if (dis && dis.getTime() >= latest.getTime()) continue;   // already reviewed & dismissed for these days
    const daysSince = Math.round((todayStart.getTime() - latest.getTime()) / 86400000);
    const valuePaise = valueUndelivered(g.rows, g.sub);
    const rollforward = g.sub.status === "ACTIVE" && daysSince <= STALE_WINDOW_DAYS;
    out.push({
      subscriptionId: subId,
      code: subId.slice(-6).toUpperCase(),
      customerId: g.sub.userId,
      customerName: g.sub.user?.name || "—",
      planName: g.sub.plan?.name || "—",
      status: g.sub.status,
      undeliveredDays: dates.length,
      valuePaise,
      staleDates: dates.map(iso),
      recommendation: rollforward ? "rollforward" : "credit",
      reason: rollforward
        ? `Lapsed ${daysSince}d ago · still ACTIVE — reschedule the ${dates.length} paid day(s)`
        : `Lapsed ${daysSince}d ago${g.sub.status !== "ACTIVE" ? ` · ${g.sub.status}` : ""} — credit ₹${(valuePaise / 100).toFixed(0)} to wallet`,
    });
  }
  return out.sort((a, b) => b.undeliveredDays - a.undeliveredDays || b.valuePaise - a.valuePaise);
}

/* =============================================================
   Remedies — make the customer whole. Both are idempotent: once the stale rows are
   resolved (FAILED / CANCELLED) or the sub leaves ACTIVE/PAUSED, a re-run finds nothing.
   ============================================================= */

/** Roll the undelivered days FORWARD: mark each stale day missed, then reconcile — which
 *  appends fresh make-up days (now future-anchored) and extends endDate. The customer keeps
 *  every paid delivery; nothing is charged or refunded. Best for a recent, still-active sub. */
export async function rollForwardUndelivered(subId: string, actor?: Actor): Promise<{ subscriptionId: string; missed: number; created: number; endDate: Date | null }> {
  const stale = await fetchStale({ subscriptionId: subId });
  if (!stale.length) return { subscriptionId: subId, missed: 0, created: 0, endDate: null };   // idempotent no-op
  const sub = stale[0].subscription!;
  const affected: { driverId: string | null | undefined; date: Date }[] = [];
  for (const d of stale) {
    if (d.driverId) affected.push({ driverId: d.driverId, date: d.date });
    await detachAssignment(d.id, d.driverId, actor?.actorRole).catch(() => {});
    await db.delivery.update({ where: { id: d.id }, data: { status: "FAILED", adjustReason: "LAPSED_UNDELIVERED", adjustNote: "Paid day passed undelivered — rescheduled" } });
  }
  const rec = await reconcileSchedule(subId);                       // appends future make-ups + extends endDate
  await reoptimizeAffected(affected).catch(() => {});
  await db.subscriptionEvent.create({ data: { subscriptionId: subId, type: "ADJUSTED", summary: `${stale.length} undelivered day(s) rolled forward — schedule extended`, detail: { days: stale.length, created: rec.created, newEndDate: rec.endDate }, byId: actor?.actorId ?? null, byRole: actor?.actorRole ?? "system" } }).catch(() => {});
  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "subscription.undelivered.rollforward", target: `${subId.slice(-6).toUpperCase()} · ${stale.length} day(s) · +${rec.created} make-up(s)` }).catch(() => {});
  try { if (sub.userId) await notifyMissedDeliveryAdjusted(sub.userId, { newEndDate: rec.endDate }); } catch { /* non-blocking */ }
  return { subscriptionId: subId, missed: stale.length, created: rec.created, endDate: rec.endDate };
}

/** CREDIT the undelivered days to the customer's wallet: value them (per-day, or a trial's
 *  paid amount pro-rated), mark each stale day CANCELLED (resolved — no make-up), credit the
 *  wallet, and close the subscription only if no live future day remains. Best for a lapsed
 *  trial / inactive customer where re-delivering late doesn't help. */
export async function creditUndelivered(subId: string, actor?: Actor): Promise<{ subscriptionId: string; credited: boolean; amountPaise: number; days: number }> {
  const stale = await fetchStale({ subscriptionId: subId });
  if (!stale.length) return { subscriptionId: subId, credited: false, amountPaise: 0, days: 0 };   // idempotent no-op
  const sub = stale[0].subscription!;
  const amountPaise = valueUndelivered(stale, sub);
  const affected: { driverId: string | null | undefined; date: Date }[] = [];
  for (const d of stale) {
    if (d.driverId) affected.push({ driverId: d.driverId, date: d.date });
    await detachAssignment(d.id, d.driverId, actor?.actorRole).catch(() => {});
    await db.delivery.update({ where: { id: d.id }, data: { status: "CANCELLED", adjustReason: "CREDITED_LAPSED", adjustNote: "Paid day passed undelivered — wallet credited" } });
  }
  let credited = false;
  if (sub.userId && amountPaise > 0) {
    await adminCredit({ userId: sub.userId, amountPaise, reason: `Undelivered days — ${sub.plan?.name || "subscription"} (${stale.length} day(s))`, kind: "refund", actorId: actor?.actorId });
    credited = true;
  }
  // Close the subscription only if nothing live remains in the future (a partially-missed
  // ongoing sub keeps delivering; a fully-lapsed one is done).
  const todayStart = istDayWindow().start;
  const futureLive = await db.delivery.count({ where: { subscriptionId: subId, date: { gte: todayStart }, status: { notIn: ["CANCELLED", "FAILED", "SKIPPED"] } } });
  if (futureLive === 0) await db.subscription.update({ where: { id: subId }, data: { status: "COMPLETED" } }).catch(() => {});
  await reoptimizeAffected(affected).catch(() => {});
  await db.subscriptionEvent.create({ data: { subscriptionId: subId, type: "REFUND", summary: `${stale.length} undelivered day(s) credited to wallet (₹${(amountPaise / 100).toFixed(0)})${futureLive === 0 ? " — subscription closed" : ""}`, detail: { days: stale.length, amountPaise, closed: futureLive === 0 }, byId: actor?.actorId ?? null, byRole: actor?.actorRole ?? "system" } }).catch(() => {});
  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "subscription.undelivered.credit", target: `${subId.slice(-6).toUpperCase()} · ${stale.length} day(s) · ₹${(amountPaise / 100).toFixed(2)}` }).catch(() => {});
  try {
    if (sub.userId && credited) await notify(sub.userId, {
      title: "We've credited your wallet 🙏",
      body: `${stale.length} delivery day(s) on your ${sub.plan?.name || "subscription"} couldn't be delivered, so we've credited ₹${(amountPaise / 100).toFixed(0)} to your DOODLY wallet. Sorry for the inconvenience — it's ready to use on your next order.`,
      email: true, emailSubject: "A wallet credit from DOODLY 🙏",
    });
  } catch { /* non-blocking */ }
  return { subscriptionId: subId, credited, amountPaise, days: stale.length };
}
