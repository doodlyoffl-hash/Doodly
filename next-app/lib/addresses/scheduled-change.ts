/* =============================================================
   DOODLY — Scheduled Address Change service (tenant-friendly)
   The transactional core behind the customer + admin address-change
   APIs and the daily cron. A customer can move a subscription's
   delivery address IMMEDIATELY or from a FUTURE effective date without
   recreating the subscription.

   On the effective date (cron, or lazily on-read) we:
     • flip Subscription.addressId → everything downstream (assignment,
       routes, driver app) resolves the new address live;
     • repoint + unassign any already-generated FUTURE deliveries so the
       next auto-assign places them by the new zone;
     • pin completed/past deliveries via their Delivery.address snapshot
       so history is never rewritten.

   Every mutation appends a SubscriptionEvent + AuditLog and (outside the
   transaction) fires notifications. notify()/audit() never throw.
   ============================================================= */
import "server-only";
import { Prisma, type AddressChangeStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { assertServiceable } from "@/lib/addresses/helpers";
import { logSubEvent, type Actor } from "@/lib/subscriptions/admin";
import { audit } from "@/lib/auth/audit";
import { notify } from "@/lib/notifications/dispatch";
import type { ReqContext } from "@/lib/auth/request";

// ---------------------------------------------------------------- dates
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Exclusive upper bound for "today or earlier" = start of tomorrow. */
function dueCutoff() { return addDays(startOfDay(new Date()), 1); }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function fmtDate(d: Date) { return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

// ---------------------------------------------------------------- shaping
const addrSelect = {
  id: true, label: true, line1: true, line2: true, area: true, city: true, state: true, pincode: true,
} as const;

export const changeInclude = {
  oldAddress: { select: addrSelect },
  newAddress: { select: addrSelect },
  subscription: { select: { id: true, status: true, plan: { select: { name: true } } } },
  user: { select: { id: true, name: true, phone: true, email: true } },
} as const;

export function getChange(id: string) {
  return db.scheduledAddressChange.findUnique({ where: { id }, include: changeInclude });
}

// ---------------------------------------------------------------- admin alert
async function notifyAdmins(title: string, body: string) {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    for (const a of admins) await notify(a.id, { title, body });
  } catch { /* non-blocking */ }
}

// ================================================================ apply
/**
 * Apply one scheduled change: flip the subscription address, repoint +
 * unassign future deliveries, supersede any prior ACTIVE change, and mark
 * this one ACTIVE. Re-validates serviceability first (unless `force`), and
 * on failure holds the change (stays SCHEDULED) + alerts customer & admin.
 * Notifications/audit run AFTER the transaction. Idempotent: a change that
 * isn't SCHEDULED is a no-op.
 */
export async function applyChange(changeId: string, actor: Actor, opts?: { force?: boolean; ctx?: ReqContext }) {
  // Load + external serviceability check OUTSIDE the transaction (keeps the tx short
  // and write-only, and never mixes a non-tx read into the interactive transaction).
  const change = await db.scheduledAddressChange.findUnique({
    where: { id: changeId },
    include: { newAddress: { select: { id: true, pincode: true } } },
  });
  if (!change || change.status !== "SCHEDULED") return { applied: false, reason: "not_scheduled" as const, change: null };

  let serviceable = true;
  try { await assertServiceable(change.newAddress.pincode); } catch { serviceable = false; }
  if (!serviceable && !opts?.force) {
    await db.scheduledAddressChange.update({ where: { id: change.id }, data: { serviceabilityFailedAt: new Date() } });
    await notify(change.userId, { title: "Address change needs attention", body: "Your new delivery address is no longer serviceable, so we couldn't switch it. Please pick another address or contact support.", email: true });
    await notifyAdmins("Scheduled address change held", `A scheduled address change (${change.id}) could not be applied — the new address is no longer serviceable.`);
    await audit({ userId: change.userId, actorRole: "system", action: "address.change.serviceability_failed", target: change.id });
    return { applied: false, reason: "not_serviceable" as const, change };
  }

  const result = await db.$transaction(async (tx) => {
    // Re-assert still SCHEDULED inside the tx (guard against a concurrent apply).
    const cur = await tx.scheduledAddressChange.findUnique({ where: { id: changeId }, select: { status: true } });
    if (!cur || cur.status !== "SCHEDULED") return { applied: false, affectedDriverIds: [] as string[] };

    // Flip the subscription's delivery address — downstream reads it live.
    await tx.subscription.update({ where: { id: change.subscriptionId }, data: { addressId: change.newAddressId } });

    // Repoint + unassign any already-generated FUTURE deliveries (date >= effective).
    const future = await tx.delivery.findMany({
      where: {
        subscriptionId: change.subscriptionId,
        date: { gte: startOfDay(change.effectiveDate) },
        status: { in: ["SCHEDULED", "ASSIGNED", "ACCEPTED"] },
      },
      select: { id: true, driverId: true, assignment: { select: { id: true } }, queueEntry: { select: { id: true } } },
    });
    const affectedDriverIds = new Set<string>();
    for (const d of future) {
      if (d.assignment) await tx.deliveryAssignment.delete({ where: { deliveryId: d.id } });
      if (d.queueEntry) await tx.assignmentQueue.delete({ where: { deliveryId: d.id } });
      await tx.delivery.update({
        where: { id: d.id },
        data: { addressId: change.newAddressId, routeId: null, driverId: null, sequence: null, status: "SCHEDULED" },
      });
      if (d.driverId) affectedDriverIds.add(d.driverId);
      await tx.assignmentLog.create({
        data: { action: "UNASSIGN", deliveryId: d.id, driverId: d.driverId ?? null, actorId: null, actorRole: actor.actorRole ?? "system", note: "address_changed", meta: { changeId: change.id, reason: "address_changed" } },
      });
    }

    // Supersede any prior ACTIVE change for this subscription, then activate this one.
    await tx.scheduledAddressChange.updateMany({ where: { subscriptionId: change.subscriptionId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
    await tx.scheduledAddressChange.update({ where: { id: change.id }, data: { status: "ACTIVE", appliedAt: new Date(), serviceabilityFailedAt: null } });

    await logSubEvent(tx, change.subscriptionId, "ADDRESS_CHANGED", "Delivery address updated", { address: { from: change.oldAddressId, to: change.newAddressId } }, actor);

    return { applied: true, affectedDriverIds: Array.from(affectedDriverIds) };
  }, { timeout: 20000 });

  // ---- side-effects (never throw) ----
  if (result.applied) {
    await audit({ userId: change.userId, actorRole: actor.actorRole ?? "system", action: "address.change.apply", target: change.id, ctx: opts?.ctx });
    await notify(change.userId, { title: "Delivery address updated", body: "Your delivery address has been updated successfully.", email: true, whatsapp: true });
    for (const driverId of result.affectedDriverIds) {
      try {
        const drv = await db.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
        if (drv?.userId) await notify(drv.userId, { title: "Route update", body: "A customer on your route changed their delivery address. Please refresh your route." });
      } catch { /* non-blocking */ }
    }
  }
  return { applied: result.applied, reason: (result.applied ? "applied" : "not_scheduled") as "applied" | "not_scheduled", change };
}

// ================================================================ schedule
export interface ScheduleInput {
  userId: string;
  subscriptionId: string;
  newAddressId: string;
  effectiveDate?: string | Date | null;   // ignored when immediate
  immediate?: boolean;
  note?: string | null;
  actor: Actor;
  ctx?: ReqContext;
}

/**
 * Create (or edit-in-place, honouring the one-SCHEDULED-per-subscription
 * rule) a scheduled change. Validates ownership + serviceability. If
 * immediate, applies right away; otherwise notifies "scheduled".
 */
export async function scheduleChange(input: ScheduleInput) {
  const sub = await db.subscription.findFirst({ where: { id: input.subscriptionId, userId: input.userId } });
  if (!sub) throw Errors.notFound("Subscription not found.");
  if (sub.status === "CANCELLED" || sub.status === "COMPLETED") throw Errors.badRequest("This subscription is no longer active.");

  const newAddr = await db.address.findFirst({ where: { id: input.newAddressId, userId: input.userId }, select: { id: true, pincode: true } });
  if (!newAddr) throw Errors.notFound("Address not found.");

  // Serviceability is the security boundary (mirrors the address-save endpoints).
  await assertServiceable(newAddr.pincode);

  const immediate = !!input.immediate;
  if (!immediate && sub.addressId === input.newAddressId) {
    throw Errors.badRequest("That address is already this subscription's delivery address.");
  }

  let eff: Date;
  if (immediate) {
    eff = startOfDay(new Date());
  } else {
    if (!input.effectiveDate) throw Errors.badRequest("Pick an effective date, or choose to change immediately.");
    eff = startOfDay(new Date(input.effectiveDate));
    if (Number.isNaN(eff.getTime())) throw Errors.badRequest("Invalid effective date.");
    if (eff < addDays(startOfDay(new Date()), 1)) throw Errors.badRequest("Choose a future date (tomorrow or later), or change immediately.");
  }

  // One active scheduled change per subscription → edit the existing SCHEDULED row.
  const existing = await db.scheduledAddressChange.findFirst({ where: { subscriptionId: input.subscriptionId, status: "SCHEDULED" } });
  const base = {
    oldAddressId: sub.addressId,
    newAddressId: input.newAddressId,
    effectiveDate: eff,
    immediate,
    requestedById: input.actor.actorId ?? null,
    requestedByRole: input.actor.actorRole ?? null,
    note: input.note ?? null,
    serviceabilityFailedAt: null,
    reminderSentAt: null,
    scheduledNotifiedAt: null,
  };
  const change = existing
    ? await db.scheduledAddressChange.update({ where: { id: existing.id }, data: base })
    : await db.scheduledAddressChange.create({ data: { userId: input.userId, subscriptionId: input.subscriptionId, status: "SCHEDULED", ...base } });

  await logSubEvent(
    db, input.subscriptionId, "ADDRESS_CHANGE_SCHEDULED",
    immediate ? "Delivery address change (immediate)" : `Delivery address change scheduled for ${fmtDate(eff)}`,
    { address: { from: sub.addressId, to: input.newAddressId }, effectiveDate: eff, immediate }, input.actor,
  );
  await audit({ userId: input.userId, actorRole: input.actor.actorRole ?? "customer", action: existing ? "address.change.reschedule" : "address.change.schedule", target: change.id, ctx: input.ctx });

  if (immediate) {
    const res = await applyChange(change.id, input.actor, { ctx: input.ctx });
    return { change: await getChange(change.id), applied: res.applied, serviceabilityFailed: res.reason === "not_serviceable" };
  }

  await notify(input.userId, { title: "Address change scheduled", body: `Your delivery address will change from ${fmtDate(eff)}.`, email: true, whatsapp: true });
  await db.scheduledAddressChange.update({ where: { id: change.id }, data: { scheduledNotifiedAt: new Date() } });
  return { change: await getChange(change.id), applied: false, serviceabilityFailed: false };
}

// ================================================================ edit / cancel
export async function editChange(
  id: string,
  patch: { newAddressId?: string; effectiveDate?: string | Date | null; immediate?: boolean; note?: string | null },
  actor: Actor,
  opts: { userId?: string; ctx?: ReqContext } = {},
) {
  const change = await db.scheduledAddressChange.findUnique({ where: { id } });
  if (!change || (opts.userId && change.userId !== opts.userId)) throw Errors.notFound("Scheduled change not found.");
  if (change.status !== "SCHEDULED") throw Errors.badRequest("Only a scheduled (not-yet-applied) change can be edited.");

  const data: Record<string, unknown> = {};
  if (patch.newAddressId && patch.newAddressId !== change.newAddressId) {
    const addr = await db.address.findFirst({ where: { id: patch.newAddressId, userId: change.userId }, select: { pincode: true } });
    if (!addr) throw Errors.notFound("Address not found.");
    await assertServiceable(addr.pincode);
    data.newAddressId = patch.newAddressId;
    data.serviceabilityFailedAt = null;
  }
  if (patch.immediate) {
    data.immediate = true;
    data.effectiveDate = startOfDay(new Date());
  } else if (patch.effectiveDate) {
    const eff = startOfDay(new Date(patch.effectiveDate));
    if (Number.isNaN(eff.getTime())) throw Errors.badRequest("Invalid effective date.");
    if (eff < addDays(startOfDay(new Date()), 1)) throw Errors.badRequest("Choose a future date (tomorrow or later).");
    data.effectiveDate = eff;
    data.immediate = false;
    data.reminderSentAt = null;
  }
  if (patch.note !== undefined) data.note = patch.note;
  if (Object.keys(data).length === 0) return getChange(id);

  await db.scheduledAddressChange.update({ where: { id }, data });
  await logSubEvent(db, change.subscriptionId, "ADDRESS_CHANGE_UPDATED", "Scheduled delivery address change updated", data, actor);
  await audit({ userId: change.userId, actorRole: actor.actorRole ?? "customer", action: "address.change.edit", target: id, ctx: opts.ctx });

  const fresh = await db.scheduledAddressChange.findUnique({ where: { id }, select: { immediate: true, status: true } });
  if (fresh?.immediate && fresh.status === "SCHEDULED") await applyChange(id, actor, { ctx: opts.ctx });
  return getChange(id);
}

export async function cancelChange(id: string, actor: Actor, opts: { userId?: string; ctx?: ReqContext } = {}) {
  const change = await db.scheduledAddressChange.findUnique({ where: { id } });
  if (!change || (opts.userId && change.userId !== opts.userId)) throw Errors.notFound("Scheduled change not found.");
  if (change.status !== "SCHEDULED") throw Errors.badRequest("Only a scheduled (not-yet-applied) change can be cancelled.");

  await db.scheduledAddressChange.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.actorId ?? null } });
  await logSubEvent(db, change.subscriptionId, "ADDRESS_CHANGE_CANCELLED", "Scheduled delivery address change cancelled", { changeId: id }, actor);
  await audit({ userId: change.userId, actorRole: actor.actorRole ?? "customer", action: "address.change.cancel", target: id, ctx: opts.ctx });
  return getChange(id);
}

/** When a subscription is cancelled, drop any not-yet-applied address change. */
export async function cancelScheduledForSubscription(subscriptionId: string, actor: Actor) {
  const rows = await db.scheduledAddressChange.findMany({ where: { subscriptionId, status: "SCHEDULED" }, select: { id: true } });
  for (const r of rows) {
    try { await cancelChange(r.id, actor); } catch { /* best-effort */ }
  }
  return rows.length;
}

// ================================================================ cron / lazy
/** Apply every change whose effective date has arrived (today or earlier). */
export async function applyDueChanges() {
  const due = await db.scheduledAddressChange.findMany({ where: { status: "SCHEDULED", effectiveDate: { lt: dueCutoff() } }, select: { id: true } });
  let applied = 0, held = 0;
  for (const d of due) {
    const res = await applyChange(d.id, { actorRole: "system" });
    if (res.applied) applied++; else held++;
  }
  return { due: due.length, applied, held };
}

/** Send the "starts tomorrow" reminder for changes effective the next day. */
export async function sendChangeReminders() {
  const start = addDays(startOfDay(new Date()), 1);
  const end = addDays(start, 1);
  const rows = await db.scheduledAddressChange.findMany({ where: { status: "SCHEDULED", reminderSentAt: null, effectiveDate: { gte: start, lt: end } } });
  let sent = 0;
  for (const r of rows) {
    await notify(r.userId, { title: "Delivery address changes tomorrow", body: "Your deliveries will start at your new address tomorrow.", email: true, whatsapp: true });
    await db.scheduledAddressChange.update({ where: { id: r.id }, data: { reminderSentAt: new Date() } });
    sent++;
  }
  return { sent };
}

/** Lazy safety-net — apply any due change for one subscription (called on read). */
export async function applyDueForSubscription(subscriptionId: string) {
  const due = await db.scheduledAddressChange.findMany({ where: { subscriptionId, status: "SCHEDULED", effectiveDate: { lt: dueCutoff() } }, select: { id: true } });
  for (const d of due) await applyChange(d.id, { actorRole: "system" });
  return due.length;
}

// ================================================================ reads
export async function listForUser(userId: string) {
  return db.scheduledAddressChange.findMany({
    where: { userId, status: { in: ["SCHEDULED", "ACTIVE"] } },
    orderBy: [{ status: "asc" }, { effectiveDate: "asc" }],
    include: changeInclude,
  });
}

export interface AdminListFilter { status?: string; q?: string; from?: Date; to?: Date; }
export async function listForAdmin(filter: AdminListFilter = {}) {
  const where: Prisma.ScheduledAddressChangeWhereInput = {};
  if (filter.status && filter.status !== "ALL") where.status = filter.status as AddressChangeStatus;
  if (filter.from || filter.to) where.effectiveDate = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
  if (filter.q) {
    const q = filter.q.trim();
    where.user = { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] };
  }
  return db.scheduledAddressChange.findMany({ where, orderBy: [{ effectiveDate: "asc" }, { createdAt: "desc" }], take: 500, include: changeInclude });
}
