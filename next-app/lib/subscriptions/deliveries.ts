/* =============================================================
   DOODLY — Subscription delivery scheduling & lifecycle engine.

   Milk subscriptions deliver EVERY day for the plan's duration. The
   heart is reconcileSchedule(): it keeps the number of *counted*
   deliveries (delivered + still-active) equal to the subscription's
   paid `target`, appending make-up days (and extending endDate) whenever
   a day is SKIPPED (customer cancel/skip) or FAILED (we missed it), and
   trimming surplus days when one is reinstated. Every lifecycle op
   (skip a date, adjust a miss, reinstate, extend, cancel) reduces to
   "mark the affected delivery + reconcileSchedule". Idempotent, dedupes
   by IST calendar day, so the customer never loses a paid day and a day
   is never duplicated. Reuses shouldDeliver().
   ============================================================= */
import "server-only";
import { Prisma, type DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { shouldDeliver, type Sub as SubRule } from "@/lib/subscription";

const HORIZON_DAYS = 7;
const CAP = 200;                                   // hard ceiling on materialised days
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const dayKey = (d: Date) => startOfDay(d).getTime();

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

// Delivery statuses that COUNT toward the paid target (fulfilled OR still on track).
// SKIPPED (customer cancel/skip) and FAILED (we missed it) do NOT count — they get made up.
const COUNTING: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED"];
const COUNTING_SET = new Set<string>(COUNTING);

/** Append-only subscription event (avoids a circular import on admin.logSubEvent). */
async function logEvent(subscriptionId: string, type: string, summary: string, detail?: unknown, actor?: Actor) {
  await db.subscriptionEvent.create({
    data: { subscriptionId, type, summary, ...(detail !== undefined ? { detail: detail as Prisma.InputJsonValue } : {}), byId: actor?.actorId ?? null, byRole: actor?.actorRole ?? "system", ip: actor?.ip ?? null },
  }).catch(() => {});
}

/** Detach a delivery from its driver/route/queue (mirrors lib/addresses/scheduled-change
    applyChange) — hard-deletes the assignment + queue rows and clears routing, WITHOUT
    forcing a status (the caller sets SKIPPED / FAILED / SCHEDULED). Safe if unassigned. */
export async function detachAssignment(deliveryId: string, driverId: string | null, actorRole?: string) {
  await db.deliveryAssignment.deleteMany({ where: { deliveryId } }).catch(() => {});
  await db.assignmentQueue.deleteMany({ where: { deliveryId } }).catch(() => {});
  await db.delivery.update({ where: { id: deliveryId }, data: { driverId: null, routeId: null, sequence: null } }).catch(() => {});
  await db.assignmentLog.create({ data: { action: "UNASSIGN", deliveryId, driverId: driverId ?? null, actorId: null, actorRole: actorRole ?? "system", note: "subscription_lifecycle" } }).catch(() => {});
}

/* =============================================================
   reconcileSchedule — the engine. Ensures counted deliveries == target.
   ============================================================= */
export async function reconcileSchedule(subscriptionId: string): Promise<{ created: number; removed: number; endDate: Date | null }> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true, status: true, startDate: true, endDate: true, pausedFrom: true, pausedUntil: true,
      skipDates: true, deliverySlot: true, addressId: true, targetDeliveries: true,
      plan: { select: { days: true } },
      items: { select: { qty: true } },
      deliveries: { select: { id: true, date: true, status: true, driverId: true, routeId: true, assignment: { select: { id: true } }, queueEntry: { select: { id: true } } } },
    },
  });
  if (!sub || sub.status !== "ACTIVE") return { created: 0, removed: 0, endDate: sub?.endDate ?? null };

  const target = Math.max(0, Math.min(CAP, sub.targetDeliveries ?? sub.plan.days ?? 0));
  const rule: SubRule = { status: "ACTIVE", startDate: startOfDay(sub.startDate), pausedFrom: sub.pausedFrom, pausedUntil: sub.pausedUntil, skipDates: sub.skipDates };
  const bottleCount = Math.max(1, sub.items.reduce((s, i) => s + (i.qty || 0), 0));

  const counted = sub.deliveries.filter((d) => COUNTING_SET.has(d.status)).length;
  const needed = target - counted;
  const haveDays = new Set(sub.deliveries.map((d) => dayKey(d.date)));

  let created = 0, removed = 0;

  if (needed > 0) {
    // append `needed` deliverable days AFTER the latest existing delivery day
    const latest = sub.deliveries.reduce((m, d) => Math.max(m, dayKey(d.date)), 0);
    const anchor = latest ? addDays(new Date(latest), 1) : startOfDay(sub.startDate);
    const toCreate: Date[] = [];
    for (let i = 0; toCreate.length < needed && i < needed + 400; i++) {
      const day = addDays(anchor, i);
      if (!shouldDeliver(rule, day)) continue;      // skip paused / skip-dated days
      if (haveDays.has(day.getTime())) continue;    // never duplicate a calendar day
      toCreate.push(day); haveDays.add(day.getTime());
    }
    if (toCreate.length) {
      await db.delivery.createMany({ data: toCreate.map((date) => ({ subscriptionId: sub.id, addressId: sub.addressId, date, slot: sub.deliverySlot, status: "SCHEDULED" as const, bottleCount })) });
      created = toCreate.length;
    }
  } else if (needed < 0) {
    // surplus (e.g. after reinstate / lowered target) → drop the LAST |needed| SAFE future rows
    const today = startOfDay(new Date());
    const removable = sub.deliveries
      .filter((d) => d.status === "SCHEDULED" && !d.driverId && !d.routeId && !d.assignment && !d.queueEntry && startOfDay(d.date).getTime() >= today.getTime())
      .sort((a, b) => dayKey(b.date) - dayKey(a.date))
      .slice(0, -needed)
      .map((d) => d.id);
    if (removable.length) { const r = await db.delivery.deleteMany({ where: { id: { in: removable } } }); removed = r.count; }
  }

  // Recompute endDate (last counted day) + nextDeliveryAt (earliest future counted day).
  const fresh = await db.delivery.findMany({ where: { subscriptionId: sub.id, status: { in: COUNTING } }, select: { date: true }, orderBy: { date: "asc" } });
  const today = startOfDay(new Date());
  const endDate = fresh.length ? startOfDay(fresh[fresh.length - 1].date) : (sub.endDate ? startOfDay(sub.endDate) : null);
  const next = fresh.map((d) => startOfDay(d.date)).find((d) => d.getTime() >= today.getTime()) ?? null;
  await db.subscription.update({ where: { id: sub.id }, data: { endDate, nextDeliveryAt: next } }).catch(() => {});

  return { created, removed, endDate };
}

/* =============================================================
   Lifecycle operations (each = mark the delivery + reconcile).
   ============================================================= */

/** Customer/admin cancels or skips specific date(s). Marks each day's delivery SKIPPED
    (detaching any assignment) + records it on skipDates, then reconciles → appends a
    make-up per skipped day and extends endDate (the customer keeps their full count). */
export async function skipOrCancelDates(subscriptionId: string, dates: (Date | string)[], actor?: Actor): Promise<{ skipped: number; created: number; oldEndDate: Date | null; endDate: Date | null }> {
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true, status: true, endDate: true, skipDates: true } });
  if (!sub) return { skipped: 0, created: 0, oldEndDate: null, endDate: null };
  const oldEndDate = sub.endDate;
  const days = [...new Set(dates.map((d) => dayKey(new Date(d))))].map((t) => new Date(t));
  const newSkips = [...sub.skipDates];
  let skipped = 0;
  for (const day of days) {
    const del = await db.delivery.findFirst({ where: { subscriptionId, date: { gte: day, lt: addDays(day, 1) }, status: { not: "DELIVERED" } }, select: { id: true, status: true, driverId: true } });
    if (del && del.status !== "SKIPPED") {
      await detachAssignment(del.id, del.driverId, actor?.actorRole);
      await db.delivery.update({ where: { id: del.id }, data: { status: "SKIPPED", adjustReason: "CUSTOMER_REQUESTED", adjustNote: null } });
      skipped++;
    }
    if (!newSkips.some((sd) => dayKey(sd) === day.getTime())) newSkips.push(day);
  }
  await db.subscription.update({ where: { id: subscriptionId }, data: { skipDates: newSkips } }).catch(() => {});
  const rec = await reconcileSchedule(subscriptionId);
  await logEvent(subscriptionId, "DATE_CANCELLED", `${skipped} delivery date(s) cancelled — schedule extended`, { dates: days.map((d) => d.toISOString()), oldEndDate, newEndDate: rec.endDate }, actor);
  try { const uid = (await db.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } }))?.userId; if (uid && skipped > 0) { const { notifyDeliveryCancelled } = await import("@/lib/notifications/dispatch"); await notifyDeliveryCancelled(uid, { count: skipped, newEndDate: rec.endDate }); } } catch { /* non-blocking */ }
  return { skipped, created: rec.created, oldEndDate, endDate: rec.endDate };
}

/** Admin marks a delivery MISSED (our fault) with a reason → FAILED + reason, detach,
    reconcile (append a make-up, extend endDate). Returns the customer id for notifying. */
export async function adjustMissedDelivery(deliveryId: string, reason: string, note: string | null | undefined, actor?: Actor): Promise<{ subscriptionId: string; userId: string | null; created: number; oldEndDate: Date | null; endDate: Date | null } | null> {
  const del = await db.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true, driverId: true, subscriptionId: true, subscription: { select: { endDate: true, userId: true } } } });
  if (!del || !del.subscriptionId) return null;
  const oldEndDate = del.subscription?.endDate ?? null;
  if (del.status !== "FAILED") {
    await detachAssignment(del.id, del.driverId, actor?.actorRole);
    await db.delivery.update({ where: { id: del.id }, data: { status: "FAILED", adjustReason: reason, adjustNote: note ?? null } });
  }
  const rec = await reconcileSchedule(del.subscriptionId);
  await logEvent(del.subscriptionId, "ADJUSTED", `Missed delivery adjusted (${reason}) — schedule extended`, { deliveryId, reason, note: note ?? null, oldEndDate, newEndDate: rec.endDate }, actor);
  // Apology to the customer + ops alert for an operational failure (best-effort).
  try { if (del.subscription?.userId) { const { notifyMissedDeliveryAdjusted } = await import("@/lib/notifications/dispatch"); await notifyMissedDeliveryAdjusted(del.subscription.userId, { newEndDate: rec.endDate }); } } catch { /* non-blocking */ }
  try { const { OPS_FAULT_REASONS } = await import("./reasons"); if ((OPS_FAULT_REASONS as readonly string[]).includes(reason)) { const { notifyAdmins } = await import("@/lib/assignment/notify"); await notifyAdmins(db, "Missed delivery adjusted", `A delivery was missed (${reason}) and auto-rescheduled — the subscription was extended so the customer keeps their day.`); } } catch { /* non-blocking */ }
  return { subscriptionId: del.subscriptionId, userId: del.subscription?.userId ?? null, created: rec.created, oldEndDate, endDate: rec.endDate };
}

/** Admin reinstates a cancelled/missed delivery → back to SCHEDULED + reconcile (drops a
    now-surplus make-up so the count stays at target). */
export async function reinstateDelivery(deliveryId: string, actor?: Actor): Promise<{ subscriptionId: string; removed: number; endDate: Date | null } | null> {
  const del = await db.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true, date: true, subscriptionId: true } });
  if (!del || !del.subscriptionId) return null;
  if (del.status === "SKIPPED" || del.status === "FAILED") {
    await db.delivery.update({ where: { id: del.id }, data: { status: "SCHEDULED", adjustReason: null, adjustNote: null } });
    const s = await db.subscription.findUnique({ where: { id: del.subscriptionId }, select: { skipDates: true } });
    const dk = dayKey(del.date);
    const newSkips = (s?.skipDates ?? []).filter((sd) => dayKey(sd) !== dk);
    await db.subscription.update({ where: { id: del.subscriptionId }, data: { skipDates: newSkips } }).catch(() => {});
  }
  const rec = await reconcileSchedule(del.subscriptionId);
  await logEvent(del.subscriptionId, "REINSTATED", "Cancelled delivery reinstated", { deliveryId, removed: rec.removed, newEndDate: rec.endDate }, actor);
  return { subscriptionId: del.subscriptionId, removed: rec.removed, endDate: rec.endDate };
}

/** Manually extend a subscription by N delivery days (raises target) + reconcile. */
export async function extendSubscription(subscriptionId: string, days: number, reason: string | null | undefined, actor?: Actor): Promise<{ created: number; oldEndDate: Date | null; endDate: Date | null } | null> {
  const n = Math.floor(days);
  if (!n || n < 1) return null;
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { status: true, endDate: true, targetDeliveries: true, plan: { select: { days: true } } } });
  if (!sub || sub.status !== "ACTIVE") return null;
  const oldEndDate = sub.endDate;
  const base = sub.targetDeliveries ?? sub.plan.days ?? 0;
  await db.subscription.update({ where: { id: subscriptionId }, data: { targetDeliveries: Math.min(CAP, base + n) } });
  const rec = await reconcileSchedule(subscriptionId);
  await logEvent(subscriptionId, "EXTENDED", `Subscription extended by ${n} day(s)${reason ? ` — ${reason}` : ""}`, { days: n, reason: reason ?? null, oldEndDate, newEndDate: rec.endDate }, actor);
  try { const uid = (await db.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } }))?.userId; if (uid) { const { notifySubscriptionExtended } = await import("@/lib/notifications/dispatch"); await notifySubscriptionExtended(uid, { newEndDate: rec.endDate, reason }); } } catch { /* non-blocking */ }
  return { created: rec.created, oldEndDate, endDate: rec.endDate };
}

/** Detach + delete EVERY future non-delivered delivery (used on full cancellation). */
export async function cancelAllFutureDeliveries(subscriptionId: string, actorRole?: string): Promise<number> {
  const today = startOfDay(new Date());
  const future = await db.delivery.findMany({ where: { subscriptionId, date: { gte: today }, status: { not: "DELIVERED" } }, select: { id: true, driverId: true, assignment: { select: { id: true } }, queueEntry: { select: { id: true } } } });
  for (const d of future) if (d.assignment || d.queueEntry || d.driverId) await detachAssignment(d.id, d.driverId, actorRole);
  const ids = future.map((d) => d.id);
  if (ids.length) await db.delivery.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/* =============================================================
   Materialisation (checkout / resume) + completion + cron.
   ============================================================= */

/** Full up-front materialisation at checkout / resume. Records the paid `target`
    (if not already set) then reconciles to it. Kept for existing callers. */
export async function generateAllForSubscription(subscriptionId: string, deliveryDays: number, cap = 120): Promise<number> {
  const target = Math.max(1, Math.min(cap, Math.floor(deliveryDays) || 1));
  await db.subscription.updateMany({ where: { id: subscriptionId, targetDeliveries: null }, data: { targetDeliveries: target } }).catch(() => {});
  const rec = await reconcileSchedule(subscriptionId);
  return rec.created;
}

/**
 * Remove FUTURE, still-SCHEDULED, UNASSIGNED, UNqueued deliveries for a subscription
 * (optionally within a [from,to] window) — used when it is paused / a day is skipped, so
 * pre-materialised deliveries don't linger. Never touches assigned/queued/out/delivered
 * rows. Returns #removed.
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
 * Mark a fixed-term (non-renewing) subscription COMPLETED once it has DELIVERED its full
 * paid `target`. Auto-renewing subscriptions never auto-complete. Idempotent.
 */
export async function maybeCompleteSubscription(subscriptionId: string): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true, status: true, autoRenew: true, targetDeliveries: true, plan: { select: { days: true } } } });
  if (!sub || sub.status !== "ACTIVE" || sub.autoRenew) return false;
  const target = sub.targetDeliveries ?? sub.plan.days ?? 0;
  if (target <= 0) return false;
  const delivered = await db.delivery.count({ where: { subscriptionId, status: "DELIVERED" } });
  if (delivered < target) return false;
  await db.subscription.update({ where: { id: subscriptionId }, data: { status: "COMPLETED" } }).catch(() => {});
  await db.subscriptionEvent.create({ data: { subscriptionId, type: "COMPLETED", summary: "Subscription completed — all deliveries fulfilled", byRole: "system" } }).catch(() => {});
  return true;
}

/**
 * Nightly safety net: reconcile every ACTIVE, CONFIRMED subscription so any subscription
 * that fell short (missed a cron, a make-up not yet appended) is topped up to its target.
 * Confirmed = no order OR order PAID OR COD.
 */
export async function generateUpcomingDeliveries(_horizonDays = HORIZON_DAYS) {
  const subs = await db.subscription.findMany({
    where: { status: "ACTIVE", OR: [{ orderId: null }, { order: { status: "PAID" } }, { order: { payment: { method: "CASH" } } }] },
    select: { id: true },
    take: 5000,
  });
  let created = 0, subsTouched = 0;
  for (const s of subs) {
    const r = await reconcileSchedule(s.id).catch(() => ({ created: 0 }));
    if (r.created > 0) { created += r.created; subsTouched++; }
  }
  return { subscriptions: subs.length, created, subsTouched };
}
