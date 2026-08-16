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
// SKIPPED (customer skip), FAILED (we missed it), CUSTOMER_UNAVAILABLE + RESCHEDULED (exec
// miss at the door) do NOT count — they get made up. PARTIALLY_DELIVERED (day served) and
// CANCELLED (day forfeited at the door) DO count — no make-up.
const COUNTING: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED", "PARTIALLY_DELIVERED", "CANCELLED"];
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

/** After a disruption, re-optimise each affected executive's remaining route (once per
    driver+day). Completed stops stay frozen. Best-effort, non-blocking. */
export async function reoptimizeAffected(pairs: { driverId: string | null | undefined; date: Date }[]) {
  const seen = new Set<string>();
  try {
    const { reoptimizeDriverDay } = await import("@/lib/routes/exec-route");
    for (const p of pairs) {
      if (!p.driverId) continue;
      const key = p.driverId + "|" + p.date.toISOString().slice(0, 10);
      if (seen.has(key)) continue; seen.add(key);
      await reoptimizeDriverDay(p.driverId, p.date);
    }
  } catch { /* non-blocking — the next sweep recovers */ }
}

/** A materialised delivery row as the planner sees it. */
type PlanRow = { id?: string; date: Date; status: string; driverId: string | null; routeId: string | null; assignment: { id: string } | null; queueEntry: { id: string } | null };

/**
 * PURE planner (no DB) — the ONE source of truth for the "top-up to target" maths, shared by
 * reconcileSchedule (which writes the result) and simulateFutureDates (dry-run preview). Given
 * the current rows + rule + cadence + target it returns either the make-up days to append
 * (counted < target) or the surplus SAFE future row-ids to drop (counted > target). Never both.
 */
function planReconcile(rows: PlanRow[], rule: SubRule, cadence: number, target: number): { append: Date[]; dropIds: string[] } {
  const counted = rows.filter((d) => COUNTING_SET.has(d.status)).length;
  const needed = target - counted;
  const haveDays = new Set(rows.map((d) => dayKey(d.date)));
  if (needed > 0) {
    const latest = rows.reduce((m, d) => Math.max(m, dayKey(d.date)), 0);
    const base = latest ? addDays(new Date(latest), cadence) : startOfDay(rule.startDate);
    const today = startOfDay(new Date());
    const anchor = base.getTime() >= today.getTime() ? base : today;
    const append: Date[] = [];
    // Take an eligible, non-duplicate day, then JUMP `cadence` days to the next intended slot.
    // Pauses/skips advance the cursor one day at a time (shifting the rhythm forward, never
    // dropping a delivery). cadence=1 ⇒ every eligible day, identical to the daily behaviour.
    let cursor = anchor;
    for (let guard = 0; append.length < needed && guard < needed * cadence + 400; guard++) {
      if (!shouldDeliver(rule, cursor) || haveDays.has(dayKey(cursor))) { cursor = addDays(cursor, 1); continue; }
      const day = startOfDay(cursor);
      append.push(day); haveDays.add(dayKey(day));
      cursor = addDays(cursor, cadence);
    }
    return { append, dropIds: [] };
  }
  if (needed < 0) {
    // surplus (e.g. after reinstate / lowered target) → drop the LAST |needed| SAFE future rows
    const today = startOfDay(new Date());
    const dropIds = rows
      .filter((d) => d.status === "SCHEDULED" && !d.driverId && !d.routeId && !d.assignment && !d.queueEntry && startOfDay(d.date).getTime() >= today.getTime())
      .sort((a, b) => dayKey(b.date) - dayKey(a.date))
      .slice(0, -needed)
      .map((d) => d.id)
      .filter((x): x is string => !!x);
    return { append: [], dropIds };
  }
  return { append: [], dropIds: [] };
}

/* =============================================================
   reconcileSchedule — the engine. Ensures counted deliveries == target.
   ============================================================= */
export async function reconcileSchedule(subscriptionId: string): Promise<{ created: number; removed: number; endDate: Date | null }> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true, status: true, startDate: true, endDate: true, pausedFrom: true, pausedUntil: true,
      skipDates: true, deliverySlot: true, addressId: true, targetDeliveries: true, cadence: true,
      plan: { select: { days: true } },
      items: { select: { qty: true } },
      deliveries: { select: { id: true, date: true, status: true, driverId: true, routeId: true, assignment: { select: { id: true } }, queueEntry: { select: { id: true } } } },
    },
  });
  if (!sub || sub.status !== "ACTIVE") return { created: 0, removed: 0, endDate: sub?.endDate ?? null };

  const target = Math.max(0, Math.min(CAP, sub.targetDeliveries ?? sub.plan.days ?? 0));
  const cadence = Math.max(1, sub.cadence ?? 1);     // 1 = daily, 2 = alternate-day, every-N eligible days
  const rule: SubRule = { status: "ACTIVE", startDate: startOfDay(sub.startDate), pausedFrom: sub.pausedFrom, pausedUntil: sub.pausedUntil, skipDates: sub.skipDates };
  const bottleCount = Math.max(1, sub.items.reduce((s, i) => s + (i.qty || 0), 0));

  // Append make-up days AFTER the latest existing day (never in the PAST — a lapsed sub is
  // clamped to today so make-ups stay deliverable), or drop surplus SAFE future rows. The
  // date-stepping + surplus maths live in the pure planner (shared with the preview simulator).
  const plan = planReconcile(sub.deliveries, rule, cadence, target);
  let created = 0, removed = 0;
  if (plan.append.length) {
    await db.delivery.createMany({ data: plan.append.map((date) => ({ subscriptionId: sub.id, addressId: sub.addressId, date, slot: sub.deliverySlot, status: "SCHEDULED" as const, bottleCount })) });
    created = plan.append.length;
  }
  if (plan.dropIds.length) { const r = await db.delivery.deleteMany({ where: { id: { in: plan.dropIds } } }); removed = r.count; }

  // Recompute endDate (last counted day) + nextDeliveryAt (earliest future counted day).
  const fresh = await db.delivery.findMany({ where: { subscriptionId: sub.id, status: { in: COUNTING } }, select: { date: true }, orderBy: { date: "asc" } });
  const today = startOfDay(new Date());
  const endDate = fresh.length ? startOfDay(fresh[fresh.length - 1].date) : (sub.endDate ? startOfDay(sub.endDate) : null);
  const next = fresh.map((d) => startOfDay(d.date)).find((d) => d.getTime() >= today.getTime()) ?? null;
  await db.subscription.update({ where: { id: sub.id }, data: { endDate, nextDeliveryAt: next } }).catch(() => {});

  return { created, removed, endDate };
}

/**
 * DRY-RUN preview (NO writes) — project a subscription's FUTURE delivery schedule under an
 * optional cadence/target override, exactly as reconcileSchedule would produce it. For a
 * cadence change we first virtually drop the future UNASSIGNED SCHEDULED rows (the real op
 * removes + rebuilds them), so the projection shows the true re-spaced rhythm. Powers the
 * "your deliveries change from X to Y" confirmation without touching the DB.
 */
export async function simulateFutureDates(subscriptionId: string, opts: { cadence?: number; target?: number; respaceFuture?: boolean } = {}): Promise<{ future: Date[]; endDate: Date | null; target: number; cadence: number }> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      status: true, startDate: true, pausedFrom: true, pausedUntil: true, skipDates: true, targetDeliveries: true, cadence: true,
      plan: { select: { days: true } },
      deliveries: { select: { id: true, date: true, status: true, driverId: true, routeId: true, assignment: { select: { id: true } }, queueEntry: { select: { id: true } } } },
    },
  });
  if (!sub) return { future: [], endDate: null, target: 0, cadence: 1 };
  const cadence = Math.max(1, opts.cadence ?? sub.cadence ?? 1);
  const target = Math.max(0, Math.min(CAP, opts.target ?? sub.targetDeliveries ?? sub.plan.days ?? 0));
  const rule: SubRule = { status: "ACTIVE", startDate: startOfDay(sub.startDate), pausedFrom: sub.pausedFrom, pausedUntil: sub.pausedUntil, skipDates: sub.skipDates };
  const today = startOfDay(new Date());
  // Re-spacing (a cadence change) virtually removes future unassigned SCHEDULED rows so the new
  // rhythm governs the whole remaining run; quantity/product keep every existing date.
  const respace = opts.respaceFuture ?? (opts.cadence != null && cadence !== (sub.cadence ?? 1));
  const kept = respace
    ? sub.deliveries.filter((d) => !(d.status === "SCHEDULED" && !d.driverId && !d.routeId && !d.assignment && !d.queueEntry && startOfDay(d.date).getTime() >= today.getTime()))
    : sub.deliveries;
  const { append } = planReconcile(kept, rule, cadence, target);
  const keptFuture = kept.filter((d) => COUNTING_SET.has(d.status) && startOfDay(d.date).getTime() >= today.getTime()).map((d) => startOfDay(d.date));
  const future = [...keptFuture, ...append].sort((a, b) => a.getTime() - b.getTime());
  const allCounted = [...kept.filter((d) => COUNTING_SET.has(d.status)).map((d) => startOfDay(d.date)), ...append].sort((a, b) => a.getTime() - b.getTime());
  const endDate = allCounted.length ? allCounted[allCounted.length - 1] : null;
  return { future, endDate, target, cadence };
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
  const affected: { driverId: string | null | undefined; date: Date }[] = [];
  let skipped = 0;
  for (const day of days) {
    const del = await db.delivery.findFirst({ where: { subscriptionId, date: { gte: day, lt: addDays(day, 1) }, status: { not: "DELIVERED" } }, select: { id: true, status: true, driverId: true } });
    if (del && del.status !== "SKIPPED") {
      if (del.driverId) affected.push({ driverId: del.driverId, date: day });   // capture BEFORE detach nulls it
      await detachAssignment(del.id, del.driverId, actor?.actorRole);
      await db.delivery.update({ where: { id: del.id }, data: { status: "SKIPPED", adjustReason: "CUSTOMER_REQUESTED", adjustNote: null } });
      skipped++;
    }
    if (!newSkips.some((sd) => dayKey(sd) === day.getTime())) newSkips.push(day);
  }
  await db.subscription.update({ where: { id: subscriptionId }, data: { skipDates: newSkips } }).catch(() => {});
  const rec = await reconcileSchedule(subscriptionId);
  await reoptimizeAffected(affected);   // mid-route cancel → re-optimise each executive's remaining stops
  await logEvent(subscriptionId, "DATE_CANCELLED", `${skipped} delivery date(s) cancelled — schedule extended`, { dates: days.map((d) => d.toISOString()), oldEndDate, newEndDate: rec.endDate }, actor);
  try { const uid = (await db.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } }))?.userId; if (uid && skipped > 0) { const { notifyDeliveryCancelled } = await import("@/lib/notifications/dispatch"); await notifyDeliveryCancelled(uid, { count: skipped, newEndDate: rec.endDate }); } } catch { /* non-blocking */ }
  return { skipped, created: rec.created, oldEndDate, endDate: rec.endDate };
}

/** Admin marks a delivery MISSED (our fault) with a reason → FAILED + reason, detach,
    reconcile (append a make-up, extend endDate). Returns the customer id for notifying. */
export async function adjustMissedDelivery(deliveryId: string, reason: string, note: string | null | undefined, actor?: Actor): Promise<{ subscriptionId: string; userId: string | null; created: number; oldEndDate: Date | null; endDate: Date | null } | null> {
  const del = await db.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true, driverId: true, date: true, subscriptionId: true, subscription: { select: { status: true, endDate: true, userId: true } } } });
  if (!del || !del.subscriptionId) return null;
  const oldEndDate = del.subscription?.endDate ?? null;
  const wasDelivered = del.status === "DELIVERED" || del.status === "PARTIALLY_DELIVERED";
  const missedDriverId = del.driverId;   // capture before detach
  if (del.status !== "FAILED") {
    await detachAssignment(del.id, del.driverId, actor?.actorRole);
    await db.delivery.update({ where: { id: del.id }, data: { status: "FAILED", adjustReason: reason, adjustNote: note ?? null } });
  }
  // Reversing a DELIVERED stop must UNWIND its physical + financial side-effects (bottle ledger,
  // fleet stock, frozen revenue) and RE-SETTLE COGS — else the day keeps its drawn COGS while
  // revenue drops (via the status filter), silently overstating profit forever. Re-activate a
  // subscription this delivery had auto-COMPLETED so reconcile can materialise the make-up day.
  if (wasDelivered) {
    if (del.subscription?.status === "COMPLETED") await db.subscription.update({ where: { id: del.subscriptionId }, data: { status: "ACTIVE" } }).catch(() => {});
    try { const { reverseDeliveryCompletion } = await import("@/lib/delivery/complete"); await reverseDeliveryCompletion(del.id); } catch { /* non-blocking */ }
  }
  const rec = await reconcileSchedule(del.subscriptionId);
  await reoptimizeAffected([{ driverId: missedDriverId, date: del.date }]);
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

/** Renew a subscription for another paid cycle (AutoPay charge / admin billing renew): raise
    the paid `target` and reconcile — this materialises the new cycle's deliverable days AND
    extends endDate. Reactivates a COMPLETED subscription (a fixed-term that later turned on
    AutoPay), since reconcileSchedule only runs for ACTIVE subs. No customer notify here; the
    renewal handler owns the "renewed" message. Logs a RENEWED event.

    Two modes, both idempotent + self-correcting (target never shrinks):
      • ABSOLUTE (meta.absoluteTarget, e.g. Razorpay `paid_count × plan.days`) — safe to call from
        BOTH subscription.activated and subscription.charged, and on webhook replays: the target
        lands at max(current, absoluteTarget), so cycle 1 never double-materialises regardless of
        which event fires first or how many times it retries.
      • RELATIVE (planDays) — +planDays from the current target, for the admin billing renew (one
        call = one new cycle; low replay risk). */
export async function renewSubscriptionCycle(subscriptionId: string, planDays: number, meta?: { cycleRef?: string | null; source?: string; absoluteTarget?: number }, actor?: Actor): Promise<{ created: number; oldEndDate: Date | null; endDate: Date | null } | null> {
  const n = Math.floor(planDays);
  if ((!n || n < 1) && meta?.absoluteTarget == null) return null;
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { status: true, endDate: true, targetDeliveries: true, plan: { select: { days: true } } } });
  if (!sub || sub.status === "CANCELLED") return null;                       // never resurrect a cancelled sub
  const oldEndDate = sub.endDate;
  if (sub.status !== "ACTIVE") await db.subscription.update({ where: { id: subscriptionId }, data: { status: "ACTIVE" } }).catch(() => {});
  // `currentTarget` = the target actually materialised so far (0 if never set — e.g. a fresh
  // AutoPay sub whose order stayed PENDING). The absolute path compares against THIS, not the
  // plan.days fallback below — else cycle 1 (absoluteTarget = 1×plan.days) would equal the
  // fallback and no-op, so the first paid cycle never materialises.
  const currentTarget = sub.targetDeliveries ?? 0;
  const base = sub.targetDeliveries ?? sub.plan.days ?? 0;   // relative bump anchors on plan.days for a fresh sub
  // NB CAP (200) ceilings the cumulative target — a plan renewed past ~200 delivered days needs a
  // manual Extend / CAP raise (flagged as a follow-up); covers >6 months of a daily 30-day plan.
  const nextTarget = meta?.absoluteTarget != null ? Math.max(currentTarget, Math.floor(meta.absoluteTarget)) : base + n;
  if (meta?.absoluteTarget != null && nextTarget <= currentTarget) return { created: 0, oldEndDate, endDate: sub.endDate };  // absolute no-op (replay / already at target)
  await db.subscription.update({ where: { id: subscriptionId }, data: { targetDeliveries: Math.min(CAP, nextTarget) } });
  const rec = await reconcileSchedule(subscriptionId);
  await logEvent(subscriptionId, "RENEWED", `Renewed → target ${Math.min(CAP, nextTarget)} delivery day(s)${meta?.source ? ` (${meta.source})` : ""}`, { planDays: n, cycleRef: meta?.cycleRef ?? null, absoluteTarget: meta?.absoluteTarget ?? null, oldEndDate, newEndDate: rec.endDate }, actor);
  return { created: rec.created, oldEndDate, endDate: rec.endDate };
}

/** Detach + delete EVERY future non-delivered delivery (used on full cancellation). */
export async function cancelAllFutureDeliveries(subscriptionId: string, actorRole?: string): Promise<number> {
  const today = startOfDay(new Date());
  const future = await db.delivery.findMany({ where: { subscriptionId, date: { gte: today }, status: { not: "DELIVERED" } }, select: { id: true, driverId: true, date: true, assignment: { select: { id: true } }, queueEntry: { select: { id: true } } } });
  const affected = future.filter((d) => d.driverId).map((d) => ({ driverId: d.driverId, date: d.date }));
  for (const d of future) if (d.assignment || d.queueEntry || d.driverId) await detachAssignment(d.id, d.driverId, actorRole);
  const ids = future.map((d) => d.id);
  if (ids.length) await db.delivery.deleteMany({ where: { id: { in: ids } } });
  await reoptimizeAffected(affected);   // removed stops → re-optimise each executive's remaining route
  // Subscription ending with empties still out → open a bottle-recovery so ops can chase them.
  try {
    const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } });
    if (sub?.userId) { const { openRecovery } = await import("@/lib/bottles/recovery"); await openRecovery(sub.userId, subscriptionId); }
  } catch { /* non-blocking */ }
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
  // Stamp warehouse distance/time on the newly-created stops (one API call for the whole
  // subscription; non-blocking — the daily cron backfills anything missed).
  try { const { computeSubscriptionDeliveries } = await import("@/lib/warehouse/distance"); await computeSubscriptionDeliveries(subscriptionId); } catch { /* non-blocking */ }
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
