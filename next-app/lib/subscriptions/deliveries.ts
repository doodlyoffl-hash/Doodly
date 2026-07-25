/* =============================================================
   DOODLY — Recurring subscription delivery generation.
   Milk subscriptions deliver EVERY day for the plan's duration. This
   rolls a short horizon of SCHEDULED deliveries forward for each active,
   paid subscription — honouring skip dates, pause/vacation windows and
   the plan end date — so they flow into the assignment / driver system.
   The bridge (lib/orders/delivery-bridge.ts) creates the very first
   delivery on payment; this fills days 2..N. Idempotent (dedupes by day),
   run daily from the notifications cron. Reuses shouldDeliver().
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { shouldDeliver, type Sub as SubRule } from "@/lib/subscription";

const HORIZON_DAYS = 7;
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

interface SubForGen {
  id: string; status: string; startDate: Date; endDate: Date | null;
  pausedFrom: Date | null; pausedUntil: Date | null; skipDates: Date[];
  deliverySlot: string; nextDeliveryAt: Date | null; addressId: string;
  items: { qty: number }[];
}

/** Roll the delivery horizon forward for ONE subscription. Idempotent. Returns #created. */
export async function generateSubscriptionDeliveries(sub: SubForGen, horizonDays = HORIZON_DAYS): Promise<number> {
  if (sub.status !== "ACTIVE") return 0;
  const today = startOfDay(new Date());
  const windowEnd = addDays(today, horizonDays);
  const rule: SubRule = { status: sub.status as SubRule["status"], startDate: startOfDay(sub.startDate), pausedFrom: sub.pausedFrom, pausedUntil: sub.pausedUntil, skipDates: sub.skipDates };
  const subEnd = sub.endDate ? startOfDay(sub.endDate) : null;
  const bottleCount = Math.max(1, sub.items.reduce((s, i) => s + (i.qty || 0), 0));

  // Existing deliveries in the window → dedupe by calendar day (no unique constraint).
  const existing = await db.delivery.findMany({
    where: { subscriptionId: sub.id, date: { gte: today, lte: windowEnd } },
    select: { date: true },
  });
  const have = new Set(existing.map((d) => startOfDay(d.date).getTime()));

  const toCreate: Date[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const day = addDays(today, i);
    if (subEnd && day > subEnd) break;            // past the plan end
    if (!shouldDeliver(rule, day)) continue;       // before start / skipped / paused / vacation
    if (have.has(day.getTime())) continue;         // already scheduled
    toCreate.push(day);
  }

  if (toCreate.length) {
    await db.delivery.createMany({
      data: toCreate.map((date) => ({ subscriptionId: sub.id, addressId: sub.addressId, date, slot: sub.deliverySlot, status: "SCHEDULED" as const, bottleCount })),
    });
  }

  // Keep nextDeliveryAt pointing at the earliest upcoming deliverable day.
  let next: Date | null = null;
  for (let i = 0; i <= 120; i++) {
    const day = addDays(today, i);
    if (subEnd && day > subEnd) break;
    if (shouldDeliver(rule, day)) { next = day; break; }
  }
  if (next && (!sub.nextDeliveryAt || startOfDay(sub.nextDeliveryAt).getTime() !== next.getTime())) {
    await db.subscription.update({ where: { id: sub.id }, data: { nextDeliveryAt: next } }).catch(() => {});
  }

  return toCreate.length;
}

/**
 * Generate the rolling horizon for every ACTIVE, CONFIRMED subscription.
 * Confirmed = no checkout order (admin/prize sub) OR the order is PAID OR it's
 * a COD order — so an unpaid gateway subscription never generates phantom
 * deliveries. Run daily from the cron.
 */
/**
 * Materialise the FULL delivery schedule for ONE subscription up front, right at
 * checkout — so every future delivery is on the board immediately instead of
 * being drip-fed by the nightly cron. `deliveryDays` is how many delivery days
 * the plan buys (trial: fixedDays; p7/p30/p90: plan.days). Creates exactly that
 * many eligible days from the start (skipping paused/skip days), idempotent
 * (dedupes by calendar day), capped for safety. Returns #created.
 */
export async function generateAllForSubscription(subscriptionId: string, deliveryDays: number, cap = 120): Promise<number> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true, status: true, startDate: true, pausedFrom: true, pausedUntil: true,
      skipDates: true, deliverySlot: true, nextDeliveryAt: true, addressId: true, items: { select: { qty: true } },
    },
  });
  if (!sub || sub.status !== "ACTIVE") return 0;
  const target = Math.max(0, Math.min(cap, Math.floor(deliveryDays) || 0));
  if (!target) return 0;

  const rule: SubRule = { status: sub.status as SubRule["status"], startDate: startOfDay(sub.startDate), pausedFrom: sub.pausedFrom, pausedUntil: sub.pausedUntil, skipDates: sub.skipDates };
  const bottleCount = Math.max(1, sub.items.reduce((s, i) => s + (i.qty || 0), 0));
  const from = startOfDay(sub.startDate);

  // the next `target` eligible delivery days from the start (skips paused / skipped days)
  const wanted: Date[] = [];
  for (let i = 0; wanted.length < target && i < target + 400; i++) {
    const day = addDays(from, i);
    if (shouldDeliver(rule, day)) wanted.push(day);
  }
  const existing = await db.delivery.findMany({ where: { subscriptionId: sub.id, date: { gte: from } }, select: { date: true } });
  const have = new Set(existing.map((d) => startOfDay(d.date).getTime()));
  const toCreate = wanted.filter((d) => !have.has(d.getTime()));
  if (toCreate.length) {
    await db.delivery.createMany({
      data: toCreate.map((date) => ({ subscriptionId: sub.id, addressId: sub.addressId, date, slot: sub.deliverySlot, status: "SCHEDULED" as const, bottleCount })),
    });
  }

  // nextDeliveryAt → earliest eligible day from today.
  const today = startOfDay(new Date());
  const next = wanted.find((d) => d.getTime() >= today.getTime()) ?? null;
  if (next && (!sub.nextDeliveryAt || startOfDay(sub.nextDeliveryAt).getTime() !== next.getTime())) {
    await db.subscription.update({ where: { id: sub.id }, data: { nextDeliveryAt: next } }).catch(() => {});
  }
  return toCreate.length;
}

/**
 * Remove FUTURE, still-SCHEDULED, UNASSIGNED, UNqueued deliveries for a
 * subscription (optionally within a [from,to] window) — used when it is
 * cancelled / paused / a day is skipped, so pre-materialised deliveries don't
 * linger on the board. Never touches a delivery that's already assigned, queued,
 * out for delivery or delivered (ops owns those). Returns #removed.
 */
export async function removeScheduledDeliveries(subscriptionId: string, opts?: { from?: Date; to?: Date }): Promise<number> {
  const from = opts?.from ? startOfDay(opts.from) : startOfDay(new Date());
  const res = await db.delivery.deleteMany({
    where: {
      subscriptionId, status: "SCHEDULED", driverId: null, routeId: null,
      assignment: { is: null }, queueEntry: { is: null },
      date: { gte: from, ...(opts?.to ? { lte: startOfDay(opts.to) } : {}) },
    },
  });
  return res.count;
}

/**
 * Mark a fixed-term (non-renewing) subscription COMPLETED once every delivery is
 * terminal (delivered / failed / skipped) and at least one was delivered. Called
 * after a delivery completes. Auto-renewing subscriptions never auto-complete.
 * Idempotent.
 */
export async function maybeCompleteSubscription(subscriptionId: string): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true, status: true, autoRenew: true } });
  if (!sub || sub.status !== "ACTIVE" || sub.autoRenew) return false;
  const [pending, delivered] = await Promise.all([
    db.delivery.count({ where: { subscriptionId, status: { notIn: ["DELIVERED", "FAILED", "SKIPPED"] } } }),
    db.delivery.count({ where: { subscriptionId, status: "DELIVERED" } }),
  ]);
  if (pending > 0 || delivered === 0) return false;
  await db.subscription.update({ where: { id: subscriptionId }, data: { status: "COMPLETED" } }).catch(() => {});
  await db.subscriptionEvent.create({ data: { subscriptionId, type: "COMPLETED", summary: "Subscription completed — all deliveries fulfilled", byRole: "system" } }).catch(() => {});
  return true;
}

export async function generateUpcomingDeliveries(horizonDays = HORIZON_DAYS) {
  const subs = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ orderId: null }, { order: { status: "PAID" } }, { order: { payment: { method: "CASH" } } }],
    },
    select: {
      id: true, status: true, startDate: true, endDate: true, pausedFrom: true, pausedUntil: true,
      skipDates: true, deliverySlot: true, nextDeliveryAt: true, addressId: true, items: { select: { qty: true } },
    },
    take: 5000,
  });
  let created = 0, subsTouched = 0;
  for (const s of subs) {
    const n = await generateSubscriptionDeliveries(s, horizonDays).catch(() => 0);
    if (n > 0) { created += n; subsTouched++; }
  }
  return { subscriptions: subs.length, created, subsTouched };
}
