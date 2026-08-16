/* =============================================================
   DOODLY — Subscriptions (admin) service layer
   The single source of truth behind /api/admin/subscriptions/*.
   Money is integer paise. All lifecycle mutations append a
   SubscriptionEvent (audit timeline) and honour the 8 PM delivery
   cut-off + skip/pause rules from lib/subscription.ts.
   ============================================================= */
import "server-only";
import { Prisma, type SubStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { shouldDeliver, type Sub as SubRule } from "@/lib/subscription";
import { assertDeliverableAddress } from "@/lib/addresses/deliverable";
import { adminCredit } from "@/lib/wallet/service";
import type {
  SubListItem, SubListResponse, SubStats, SubDetail, SubReports, SubScheduleDay, SubEventRow,
} from "./types";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const CUTOFF_HOUR = 20; // 8 PM — changes after this land a day later
const RENEWAL_WINDOW_DAYS = 7;

export const shortId = (id: string) => id.slice(-8).toUpperCase();

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfMonth(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(1); return x; }

/** Earliest delivery date honouring the 8 PM cut-off, relative to `placedAt`. */
function earliestByCutoff(placedAt: Date): Date {
  return startOfDay(addDays(placedAt, placedAt.getHours() >= CUTOFF_HOUR ? 2 : 1));
}

/** First deliverable day at/after `from` for a subscription (skip + pause aware). */
function nextDeliverableFrom(rule: SubRule, from: Date): Date | null {
  let d = startOfDay(from);
  for (let i = 0; i < 90; i++) {
    if (shouldDeliver(rule, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}

function ruleOf(s: { status: string; startDate: Date; pausedFrom: Date | null; pausedUntil: Date | null; skipDates: Date[] }): SubRule {
  return { status: s.status as SubRule["status"], startDate: s.startDate, pausedFrom: s.pausedFrom, pausedUntil: s.pausedUntil, skipDates: s.skipDates };
}

/** Plan-total maths for a per-delivery price over a plan's days. */
function priceSub(perDeliveryPaise: number, plan: { days: number; discountBps: number }) {
  const originalPaise = perDeliveryPaise * plan.days;
  const discountPaise = Math.round((originalPaise * plan.discountBps) / 10000);
  return { originalPaise, discountPaise, totalPaise: originalPaise - discountPaise, savedPaise: discountPaise };
}

type Tx = Prisma.TransactionClient;

/** Append a timeline event (audit). */
export async function logSubEvent(
  client: Tx | typeof db,
  subscriptionId: string,
  type: string,
  summary: string,
  detail: unknown,
  actor: Actor,
) {
  await client.subscriptionEvent.create({
    data: {
      subscriptionId, type, summary,
      detail: detail === undefined ? Prisma.JsonNull : (detail as Prisma.InputJsonValue),
      byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip,
    },
  });
}

// ---------------------------------------------------------------- stats

export async function subscriptionStats(): Promise<SubStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const renewalEnd = addDays(now, RENEWAL_WINDOW_DAYS);

  const [grouped, autopayOn, renewalsDue, newThisMonth, trial, activeForMrr, expiredLapsed] = await Promise.all([
    db.subscription.groupBy({ by: ["status"], _count: true }),
    db.subscription.count({ where: { status: "ACTIVE", autoRenew: true } }),
    db.subscription.count({ where: { status: "ACTIVE", endDate: { gte: now, lte: renewalEnd } } }),
    db.subscription.count({ where: { createdAt: { gte: monthStart } } }),
    db.trialCashback.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
    db.subscription.findMany({ where: { status: "ACTIVE" }, select: { items: { select: { qty: true, variant: { select: { dailyPaise: true } } } } } }),
    db.subscription.count({ where: { status: { in: ["ACTIVE", "PAUSED", "VACATION"] }, endDate: { lt: now } } }),
  ]);

  const countOf = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
  const total = grouped.reduce((sum, g) => sum + g._count, 0);
  const mrrPaise = activeForMrr.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0) * 30, 0);

  return {
    total,
    active: countOf("ACTIVE"),
    paused: countOf("PAUSED") + countOf("VACATION"),
    cancelled: countOf("CANCELLED"),
    expired: countOf("COMPLETED") + expiredLapsed,
    autopayOn,
    renewalsDue7d: renewalsDue,
    mrrPaise,
    trialCashback: { credited: trial._count, amountPaise: trial._sum.amountPaise ?? 0 },
    newThisMonth,
  };
}

// ---------------------------------------------------------------- list

export interface ListArgs {
  status?: string; autopay?: string; planSlug?: string; productId?: string; zoneId?: string;
  dateFrom?: string; dateTo?: string; q?: string;
  sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number;
}

const SORTABLE: Record<string, Prisma.SubscriptionOrderByWithRelationInput> = {
  created: { createdAt: "desc" }, updated: { updatedAt: "desc" }, next: { nextDeliveryAt: "asc" },
  start: { startDate: "desc" }, status: { status: "asc" },
};

const listInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, walletPaise: true } },
  plan: { select: { name: true, slug: true, days: true, discountBps: true } },
  address: { select: { zone: { select: { id: true, name: true, executive: true } } } },
  items: { select: { qty: true, variant: { select: { label: true, dailyPaise: true, product: { select: { name: true } } } } } },
  autopay: { select: { status: true } },
} satisfies Prisma.SubscriptionInclude;

export async function listSubscriptions(args: ListArgs): Promise<SubListResponse> {
  const now = new Date();
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, args.pageSize ?? 20));

  const where: Prisma.SubscriptionWhereInput = {};
  const and: Prisma.SubscriptionWhereInput[] = [];

  if (args.status) {
    if (args.status === "PAUSED") and.push({ status: { in: ["PAUSED", "VACATION"] } });
    else if (args.status === "EXPIRED") and.push({ OR: [{ status: "COMPLETED" }, { status: { in: ["ACTIVE", "PAUSED", "VACATION"] }, endDate: { lt: now } }] });
    else and.push({ status: args.status as SubStatus });
  }
  if (args.autopay === "on") and.push({ autoRenew: true });
  if (args.autopay === "off") and.push({ autoRenew: false });
  if (args.planSlug) and.push({ plan: { slug: args.planSlug } });
  if (args.productId) and.push({ items: { some: { variant: { productId: args.productId } } } });
  if (args.zoneId) and.push({ address: { zoneId: args.zoneId } });
  if (args.dateFrom || args.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (args.dateFrom) range.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) range.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    and.push({ startDate: range });
  }
  if (args.q?.trim()) {
    const q = args.q.trim();
    and.push({
      OR: [
        { id: { contains: q.toLowerCase() } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { phone: { contains: q } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const orderBy = SORTABLE[args.sort ?? "created"] ?? SORTABLE.created;
  if (args.dir && typeof Object.values(orderBy)[0] === "string") {
    const key = Object.keys(orderBy)[0] as keyof Prisma.SubscriptionOrderByWithRelationInput;
    (orderBy as Record<string, unknown>)[key] = args.dir;
  }

  const [rows, total, plans, products, zones] = await Promise.all([
    db.subscription.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: listInclude }),
    db.subscription.count({ where }),
    db.plan.findMany({ where: { active: true }, orderBy: { days: "asc" }, select: { slug: true, name: true } }),
    db.product.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.deliveryZone.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const subscriptions: SubListItem[] = rows.map((s) => {
    const perDeliveryPaise = s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
    const expired = s.status === "COMPLETED" || (!!s.endDate && s.endDate < now && s.status !== "CANCELLED");
    return {
      id: s.id,
      shortId: shortId(s.id),
      status: s.status,
      expired,
      customer: { id: s.user.id, name: s.user.name, email: s.user.email, phone: s.user.phone },
      plan: { name: s.plan.name, slug: s.plan.slug, days: s.plan.days },
      items: s.items.map((i) => ({ qty: i.qty, product: i.variant.product.name, variant: i.variant.label })),
      productNames: [...new Set(s.items.map((i) => i.variant.product.name))],
      perDeliveryPaise,
      planTotalPaise: priceSub(perDeliveryPaise, s.plan).totalPaise,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate?.toISOString() ?? null,
      nextDeliveryAt: s.nextDeliveryAt?.toISOString() ?? null,
      deliverySlot: s.deliverySlot,
      autoRenew: s.autoRenew,
      autopayStatus: s.autopay?.status ?? null,
      walletPaise: s.user.walletPaise,
      zone: s.address?.zone ? { id: s.address.zone.id, name: s.address.zone.name } : null,
      executive: s.address?.zone?.executive ?? null,
      paymentStatus: s.autoRenew ? "AUTOPAY" : "MANUAL",
      updatedAt: s.updatedAt.toISOString(),
    };
  });

  return { subscriptions, total, page, pageSize, facets: { plans, products, zones } };
}

// ---------------------------------------------------------------- detail

export async function getSubscriptionDetail(id: string): Promise<SubDetail | null> {
  const s = await db.subscription.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, walletPaise: true } },
      plan: { select: { name: true, slug: true, days: true, discountBps: true } },
      address: { select: { label: true, line1: true, line2: true, city: true, pincode: true, lat: true, lng: true, deliveryNote: true, zone: { select: { name: true, executive: true } } } },
      items: { include: { variant: { select: { label: true, ml: true, dailyPaise: true, product: { select: { name: true } } } } } },
      autopay: { select: { status: true, amountPaise: true, nextRenewalAt: true, attempts: true } },
    },
  });
  if (!s) return null;

  const [events, deliveries, deliveryGroups, walletRecent, trial] = await Promise.all([
    db.subscriptionEvent.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.delivery.findMany({ where: { subscriptionId: id }, orderBy: { date: "desc" }, take: 12, select: { id: true, date: true, status: true, bottlesOut: true, bottlesIn: true } }),
    db.delivery.groupBy({ by: ["status"], where: { subscriptionId: id }, _count: true }),
    db.walletTxn.findMany({ where: { userId: s.user.id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, kind: true, amountPaise: true, description: true, createdAt: true } }),
    db.trialCashback.findUnique({ where: { userId: s.user.id }, select: { status: true, amountPaise: true, creditedAt: true } }),
  ]);

  const perDeliveryPaise = s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
  const price = priceSub(perDeliveryPaise, s.plan);

  // 14-day schedule preview honouring skip / pause / start / end.
  const rule = ruleOf(s);
  const today = startOfDay(new Date());
  const schedule: SubScheduleDay[] = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i);
    let reason = "scheduled";
    if (s.endDate && d > startOfDay(s.endDate)) reason = "ended";
    else if (d < startOfDay(s.startDate)) reason = "before start";
    else if (s.skipDates.some((x) => startOfDay(x).getTime() === d.getTime())) reason = "skipped";
    else if (s.status === "PAUSED" || s.status === "VACATION") reason = "paused";
    else if (s.pausedFrom && s.pausedUntil && d >= startOfDay(s.pausedFrom) && d <= startOfDay(s.pausedUntil)) reason = "paused";
    return { date: d.toISOString(), deliver: shouldDeliver(rule, d), reason };
  });

  const dCount = (st: string) => deliveryGroups.find((g) => g.status === st)?._count ?? 0;

  return {
    id: s.id,
    shortId: shortId(s.id),
    status: s.status,
    customer: { id: s.user.id, name: s.user.name, email: s.user.email, phone: s.user.phone, walletPaise: s.user.walletPaise },
    address: s.address ? {
      label: s.address.label, line1: s.address.line1, line2: s.address.line2, city: s.address.city, pincode: s.address.pincode,
      lat: s.address.lat, lng: s.address.lng, deliveryNote: s.address.deliveryNote,
      zone: s.address.zone?.name ?? null, executive: s.address.zone?.executive ?? null,
    } : null,
    plan: { name: s.plan.name, slug: s.plan.slug, days: s.plan.days, discountBps: s.plan.discountBps },
    items: s.items.map((i) => ({ variantId: i.variantId, qty: i.qty, product: i.variant.product.name, variant: i.variant.label, ml: i.variant.ml, dailyPaise: i.variant.dailyPaise ?? 0 })),
    perDeliveryPaise,
    planTotalPaise: price.totalPaise,
    savedPaise: price.savedPaise,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate?.toISOString() ?? null,
    nextDeliveryAt: s.nextDeliveryAt?.toISOString() ?? null,
    deliverySlot: s.deliverySlot,
    cadence: Math.max(1, s.cadence ?? 1),
    targetDeliveries: s.targetDeliveries ?? null,
    autoRenew: s.autoRenew,
    pausedFrom: s.pausedFrom?.toISOString() ?? null,
    pausedUntil: s.pausedUntil?.toISOString() ?? null,
    skipDates: s.skipDates.map((d) => d.toISOString()),
    cancelReason: s.cancelReason,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    autopay: s.autopay ? { status: s.autopay.status, amountPaise: s.autopay.amountPaise, nextRenewalAt: s.autopay.nextRenewalAt?.toISOString() ?? null, attempts: s.autopay.attempts } : null,
    trialCashback: trial ? { status: trial.status, amountPaise: trial.amountPaise, creditedAt: trial.creditedAt?.toISOString() ?? null } : null,
    wallet: { balancePaise: s.user.walletPaise, recent: walletRecent.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })) },
    deliveries: deliveries.map((d) => ({ id: d.id, date: d.date.toISOString(), status: d.status, bottlesOut: d.bottlesOut, bottlesIn: d.bottlesIn })),
    deliveryCounts: { total: deliveryGroups.reduce((a, g) => a + g._count, 0), delivered: dCount("DELIVERED"), skipped: dCount("SKIPPED"), failed: dCount("FAILED") },
    schedule,
    events: events.map((e): SubEventRow => ({ id: e.id, type: e.type, summary: e.summary, detail: e.detail, byRole: e.byRole, createdAt: e.createdAt.toISOString() })),
  };
}

// ---------------------------------------------------------------- create

export interface CreateArgs {
  userId: string; planId: string; addressId: string;
  items: { variantId: string; qty: number }[];
  startDate?: string; deliverySlot?: string; autoRenew?: boolean;
  cadence?: number;    // 1 = daily (default), 2 = alternate-day, general every-N eligible days
  override?: boolean;   // super-admin bypass of the deliverable-address gate (audited)
}

export async function createSubscription(args: CreateArgs, actor: Actor) {
  const [user, plan, address, variants] = await Promise.all([
    db.user.findUnique({ where: { id: args.userId }, select: { id: true } }),
    db.plan.findUnique({ where: { id: args.planId }, select: { id: true, name: true, days: true } }),
    db.address.findUnique({ where: { id: args.addressId }, select: { id: true, userId: true } }),
    db.variant.findMany({ where: { id: { in: args.items.map((i) => i.variantId) } }, select: { id: true } }),
  ]);
  if (!user) throw Errors.notFound("Customer not found.");
  if (!plan) throw Errors.notFound("Plan not found.");
  if (!address || address.userId !== args.userId) throw Errors.badRequest("Address does not belong to the customer.");
  // MANDATORY deliverable-address gate (serviceable + geocoded + plausible). A
  // Super-Admin may explicitly override (audited) — the only sanctioned exception.
  await assertDeliverableAddress({ userId: args.userId, addressId: args.addressId, actorRole: actor.actorRole, override: args.override, label: "admin.subscription" });
  const known = new Set(variants.map((v) => v.id));
  if (!args.items.length || args.items.some((i) => !known.has(i.variantId) || i.qty < 1)) throw Errors.badRequest("Invalid subscription items.");

  const cadence = Math.max(1, Math.min(7, Math.round(args.cadence ?? 1)));
  const startDate = args.startDate ? startOfDay(new Date(args.startDate)) : earliestByCutoff(new Date());
  const candidate = startDate > earliestByCutoff(new Date()) ? startDate : earliestByCutoff(new Date());
  const nextDeliveryAt = nextDeliverableFrom({ status: "ACTIVE", startDate, pausedFrom: null, pausedUntil: null, skipDates: [] }, candidate);
  // placeholder end date (cadence-aware) — reconcile re-derives the true last-day on materialisation
  const endDate = addDays(startDate, Math.max(0, plan.days - 1) * cadence);

  const created = await db.subscription.create({
    data: {
      userId: args.userId, planId: args.planId, addressId: args.addressId, status: "ACTIVE",
      startDate, endDate, nextDeliveryAt, deliverySlot: args.deliverySlot || "06:00-08:00",
      autoRenew: args.autoRenew ?? true, cadence,
      items: { create: args.items.map((i) => ({ variantId: i.variantId, qty: i.qty })) },
    },
    select: { id: true },
  });
  await logSubEvent(db, created.id, "CREATED", `Subscription created on ${plan.name}`, { plan: plan.name, items: args.items.length, startDate: startDate.toISOString() }, actor);
  return { id: created.id, shortId: shortId(created.id) };
}

// ---------------------------------------------------------------- update

export interface UpdateArgs {
  planId?: string; addressId?: string; deliverySlot?: string; autoRenew?: boolean; startDate?: string;
  items?: { variantId: string; qty: number }[]; notes?: string;
}

async function loadRule(id: string) {
  const s = await db.subscription.findUnique({ where: { id }, include: { plan: { select: { name: true } }, address: { select: { label: true } }, items: { select: { variantId: true, qty: true } } } });
  return s;
}

export async function updateSubscription(id: string, args: UpdateArgs, actor: Actor) {
  const cur = await loadRule(id);
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED" || cur.status === "COMPLETED") throw Errors.conflict("Cannot edit a closed subscription.");

  const data: Prisma.SubscriptionUpdateInput = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  if (args.planId && args.planId !== cur.planId) {
    const plan = await db.plan.findUnique({ where: { id: args.planId }, select: { id: true, name: true, days: true } });
    if (!plan) throw Errors.notFound("Plan not found.");
    data.plan = { connect: { id: plan.id } };
    data.endDate = addDays(startOfDay(cur.startDate), Math.max(0, plan.days - 1) * Math.max(1, cur.cadence ?? 1));
    diff.plan = { from: cur.plan.name, to: plan.name };
  }
  if (args.addressId && args.addressId !== cur.addressId) {
    const addr = await db.address.findUnique({ where: { id: args.addressId }, select: { userId: true, label: true } });
    if (!addr || addr.userId !== cur.userId) throw Errors.badRequest("Address does not belong to the customer.");
    data.address = { connect: { id: args.addressId } };
    diff.address = { from: cur.address.label, to: addr.label };
  }
  if (args.deliverySlot && args.deliverySlot !== cur.deliverySlot) {
    data.deliverySlot = args.deliverySlot;
    diff.deliverySlot = { from: cur.deliverySlot, to: args.deliverySlot };
  }
  if (args.startDate) {
    const sd = startOfDay(new Date(args.startDate));
    if (sd.getTime() !== startOfDay(cur.startDate).getTime()) {
      data.startDate = sd;
      diff.startDate = { from: cur.startDate.toISOString(), to: sd.toISOString() };
    }
  }
  if (args.notes !== undefined && args.notes !== (cur.notes ?? "")) {
    data.notes = args.notes;
    diff.notes = { from: cur.notes, to: args.notes };
  }
  if (args.items && args.items.length) {
    const variants = await db.variant.findMany({ where: { id: { in: args.items.map((i) => i.variantId) } }, select: { id: true } });
    const known = new Set(variants.map((v) => v.id));
    if (args.items.some((i) => !known.has(i.variantId) || i.qty < 1)) throw Errors.badRequest("Invalid subscription items.");
    diff.items = { from: cur.items.map((i) => `${i.variantId}:${i.qty}`), to: args.items.map((i) => `${i.variantId}:${i.qty}`) };
  }
  if (args.autoRenew !== undefined && args.autoRenew !== cur.autoRenew) {
    data.autoRenew = args.autoRenew;
    diff.autoRenew = { from: cur.autoRenew, to: args.autoRenew };
  }

  if (!Object.keys(diff).length) return { id, changed: false };

  await db.$transaction(async (tx) => {
    if (args.items && args.items.length) {
      await tx.subscriptionItem.deleteMany({ where: { subscriptionId: id } });
      await tx.subscriptionItem.createMany({ data: args.items.map((i) => ({ subscriptionId: id, variantId: i.variantId, qty: i.qty })) });
    }
    if (Object.keys(data).length) await tx.subscription.update({ where: { id }, data });
    await logSubEvent(tx, id, "UPDATED", `Subscription edited (${Object.keys(diff).join(", ")})`, diff, actor);
  });

  // Reconcile pre-materialised FUTURE scheduled deliveries with the edit so a
  // quantity / slot / address / plan change reaches the already-created stops.
  try {
    const today = startOfDay(new Date());
    const futureWhere = { subscriptionId: id, status: "SCHEDULED" as const, date: { gte: today } };
    if (args.items && args.items.length) {
      const bottleCount = Math.max(1, args.items.reduce((s, i) => s + (i.qty || 0), 0));
      await db.delivery.updateMany({ where: futureWhere, data: { bottleCount } });
    }
    if (args.deliverySlot) await db.delivery.updateMany({ where: futureWhere, data: { slot: args.deliverySlot } });
    if (args.addressId) await db.delivery.updateMany({ where: { ...futureWhere, driverId: null, routeId: null }, data: { addressId: args.addressId } });
    if (args.planId) {
      // plan changed → reset the paid target to the new plan length and rebuild the
      // schedule (reconcile grows or shrinks it to match).
      const np = await db.plan.findUnique({ where: { id: args.planId }, select: { days: true } });
      if (np) {
        await db.subscription.update({ where: { id }, data: { targetDeliveries: np.days } });
        const { reconcileSchedule } = await import("./deliveries");
        await reconcileSchedule(id);
      }
    }
  } catch { /* non-blocking */ }

  return { id, changed: true };
}

// ------------------------------------------------ change actions (freq / qty / product)

/** Human label for a cadence value (1 = daily, 2 = alternate-day, general every-N). */
export const cadenceLabel = (c: number) => (c <= 1 ? "Daily" : c === 2 ? "Alternate-day (every 2 days)" : `Every ${c} days`);

/** A subscription must be open (not CANCELLED/COMPLETED) to accept a change. */
function assertEditable(status: string) {
  if (status === "CANCELLED" || status === "COMPLETED") throw Errors.conflict("Cannot edit a closed subscription.");
}

/**
 * Change delivery frequency (1 = daily, 2 = alternate-day, general every-N eligible days).
 * FUTURE-ONLY: the paid entitlement (targetDeliveries) is unchanged — same delivery COUNT, new
 * rhythm. Assigned/past rows stay put; future UNASSIGNED scheduled rows are dropped and rebuilt
 * at the new cadence by reconcile, so endDate re-derives to the true (~2×) span.
 */
export async function changeFrequency(id: string, cadence: number, actor: Actor) {
  const c = Math.round(Number(cadence));
  if (!Number.isFinite(c) || c < 1 || c > 7) throw Errors.badRequest("Frequency must be between daily (1) and every 7 days.");
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, cadence: true, userId: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  assertEditable(cur.status);
  const from = cur.cadence ?? 1;
  if (from === c) return { id, changed: false, cadence: c };
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { cadence: c } });
    await logSubEvent(tx, id, "FREQUENCY_CHANGED", `Delivery frequency changed: ${cadenceLabel(from)} → ${cadenceLabel(c)}`, { from, to: c, fromLabel: cadenceLabel(from), toLabel: cadenceLabel(c) }, actor);
  });
  let endDate: Date | null = null, next: Date | null = null;
  try {
    const { removeScheduledDeliveries, reconcileSchedule } = await import("./deliveries");
    await removeScheduledDeliveries(id);       // drop FUTURE unassigned SCHEDULED rows (rebuilt below at new cadence)
    const rec = await reconcileSchedule(id);   // top-up to target at the new rhythm
    endDate = rec.endDate;
  } catch { /* non-blocking */ }
  try {
    next = (await db.subscription.findUnique({ where: { id }, select: { nextDeliveryAt: true } }))?.nextDeliveryAt ?? null;
    const { notifySubscriptionFrequencyChanged } = await import("@/lib/notifications/dispatch");
    await notifySubscriptionFrequencyChanged(cur.userId, { label: cadenceLabel(c), nextDate: next, newEndDate: endDate });
  } catch { /* non-blocking */ }
  return { id, changed: true, cadence: c, endDate };
}

/**
 * Change quantity per delivery (single-product subs). FUTURE-ONLY: sets the item qty, backfills
 * the bottleCount snapshot on FUTURE scheduled rows, then reconciles. Packing/litres/revenue read
 * the live item qty, so past DELIVERED days keep their frozen figures.
 */
export async function changeQuantity(id: string, qty: number, actor: Actor) {
  const q = Math.round(Number(qty));
  if (!Number.isFinite(q) || q < 1 || q > 50) throw Errors.badRequest("Quantity must be between 1 and 50 per delivery.");
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true, items: { select: { id: true, qty: true, variant: { select: { label: true, displayName: true } } } } } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  assertEditable(cur.status);
  if (cur.items.length !== 1) throw Errors.badRequest("Quantity change supports single-product subscriptions; edit items directly for multi-product plans.");
  const item = cur.items[0];
  if (item.qty === q) return { id, changed: false, qty: q };
  await db.$transaction(async (tx) => {
    await tx.subscriptionItem.update({ where: { id: item.id }, data: { qty: q } });
    await logSubEvent(tx, id, "QUANTITY_CHANGED", `Quantity per delivery changed: ${item.qty} → ${q}`, { from: item.qty, to: q }, actor);
  });
  try {
    const today = startOfDay(new Date());
    await db.delivery.updateMany({ where: { subscriptionId: id, status: "SCHEDULED", date: { gte: today } }, data: { bottleCount: q } });
    const { reconcileSchedule } = await import("./deliveries");
    await reconcileSchedule(id);
  } catch { /* non-blocking */ }
  try { const { notifySubscriptionQuantityChanged } = await import("@/lib/notifications/dispatch"); await notifySubscriptionQuantityChanged(cur.userId, { qty: q, product: item.variant?.displayName || item.variant?.label || null }); } catch { /* non-blocking */ }
  return { id, changed: true, qty: q };
}

/**
 * Change product/variant — from-now whole-sub swap (single-product subs). Sets the item's
 * variantId; dates + counts are unchanged (deliveries carry no variant — packing/litres/revenue
 * read the live item). Past DELIVERED days keep their frozen figures. Admin-only at the route.
 */
export async function changeProduct(id: string, variantId: string, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true, items: { select: { id: true, variantId: true } } } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  assertEditable(cur.status);
  if (cur.items.length !== 1) throw Errors.badRequest("Product change supports single-product subscriptions; edit items directly for multi-product plans.");
  const item = cur.items[0];
  const variant = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, active: true, label: true, displayName: true, type: true } });
  if (!variant) throw Errors.notFound("Product not found.");
  if (variant.type !== "SUBSCRIPTION") throw Errors.badRequest("Only subscription products can be set on a subscription.");
  if (!variant.active) throw Errors.badRequest("That product is not available.");
  if (variant.id === item.variantId) return { id, changed: false };
  const label = variant.displayName || variant.label;
  await db.$transaction(async (tx) => {
    await tx.subscriptionItem.update({ where: { id: item.id }, data: { variantId: variant.id } });
    await logSubEvent(tx, id, "PRODUCT_CHANGED", `Product changed to ${label} (from-now)`, { from: item.variantId, to: variant.id, label }, actor);
  });
  try { const { reconcileSchedule } = await import("./deliveries"); await reconcileSchedule(id); } catch { /* non-blocking */ }
  try { const { notifySubscriptionProductChanged } = await import("@/lib/notifications/dispatch"); await notifySubscriptionProductChanged(cur.userId, { product: label }); } catch { /* non-blocking */ }
  return { id, changed: true, variantId: variant.id, label };
}

/**
 * DRY-RUN preview of a freq / qty / product change — returns current vs proposed schedule &
 * summary WITHOUT committing (mirrors the real reconcile via simulateFutureDates). Powers the
 * "your deliveries change from X to Y" confirmation. Only a cadence change re-spaces the dates;
 * quantity/product keep every existing date.
 */
export async function previewSubscriptionChange(id: string, args: { cadence?: number; quantity?: number; variantId?: string }) {
  const cur = await db.subscription.findUnique({
    where: { id },
    select: { status: true, cadence: true, items: { select: { qty: true, variant: { select: { id: true, label: true, displayName: true } } } } },
  });
  if (!cur) throw Errors.notFound("Subscription not found.");
  const { simulateFutureDates } = await import("./deliveries");
  const curCadence = cur.cadence ?? 1;
  const curQty = cur.items.reduce((s, i) => s + (i.qty || 0), 0);
  const curVariant = cur.items[0]?.variant;
  const curProduct = curVariant ? (curVariant.displayName || curVariant.label) : null;

  const base = await simulateFutureDates(id, {});
  const proposed = await simulateFutureDates(id, args.cadence != null ? { cadence: Math.round(args.cadence) } : {});

  let newProduct = curProduct;
  if (args.variantId && args.variantId !== curVariant?.id) {
    const v = await db.variant.findUnique({ where: { id: args.variantId }, select: { label: true, displayName: true } });
    newProduct = v ? (v.displayName || v.label) : curProduct;
  }
  const newQty = args.quantity != null ? Math.round(args.quantity) : curQty;
  const newCadence = args.cadence != null ? Math.round(args.cadence) : curCadence;
  const fmt = (ds: Date[]) => ds.slice(0, 12).map((d) => d.toISOString());

  return {
    current:  { cadence: curCadence, cadenceLabel: cadenceLabel(curCadence), quantity: curQty, product: curProduct, endDate: base.endDate?.toISOString() ?? null, next: fmt(base.future) },
    proposed: { cadence: newCadence, cadenceLabel: cadenceLabel(newCadence), quantity: newQty, product: newProduct, endDate: proposed.endDate?.toISOString() ?? null, next: fmt(proposed.future) },
    changed: newCadence !== curCadence || newQty !== curQty || (!!args.variantId && args.variantId !== curVariant?.id),
  };
}

// ---------------------------------------------------------------- lifecycle

export async function pauseSubscription(id: string, opts: { until?: string; reason?: string }, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true, plan: { select: { name: true } } } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED" || cur.status === "COMPLETED") throw Errors.conflict("Cannot pause a closed subscription.");
  const pausedUntil = opts.until ? new Date(opts.until) : null;
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { status: "PAUSED", pausedFrom: new Date(), pausedUntil } });
    await logSubEvent(tx, id, "PAUSED", opts.reason ? `Paused — ${opts.reason}` : "Subscription paused", { until: pausedUntil?.toISOString() ?? null, reason: opts.reason ?? null }, actor);
  });
  // Clear upcoming deliveries in the vacation window (or all if open-ended).
  try { const { removeScheduledDeliveries } = await import("./deliveries"); await removeScheduledDeliveries(id, { from: new Date(), to: pausedUntil ?? undefined }); } catch { /* non-blocking */ }
  // Tell the customer their deliveries are paused (else they just stop with no explanation).
  try {
    if (cur.userId) {
      const { notify } = await import("@/lib/notifications/dispatch");
      const until = pausedUntil ? pausedUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
      await notify(cur.userId, { title: "Your subscription is paused ⏸️", body: `Your ${cur.plan?.name || "DOODLY"} deliveries are paused${until ? ` until ${until}` : ""}. Resume anytime from My Subscription — you won't lose a paid day.`, email: true });
    }
  } catch { /* non-blocking */ }
  return { id, status: "PAUSED" };
}

export async function resumeSubscription(id: string, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true, startDate: true, endDate: true, skipDates: true, targetDeliveries: true, plan: { select: { name: true, days: true } } } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  const next = nextDeliverableFrom({ status: "ACTIVE", startDate: cur.startDate, pausedFrom: null, pausedUntil: null, skipDates: cur.skipDates }, earliestByCutoff(new Date()));
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { status: "ACTIVE", pausedFrom: null, pausedUntil: null, nextDeliveryAt: next } });
    await logSubEvent(tx, id, "RESUMED", "Subscription resumed", { nextDeliveryAt: next?.toISOString() ?? null }, actor);
  });
  // Refill the upcoming schedule that was cleared on pause. Reconcile off the actual delivery
  // COUNT (targetDeliveries ?? plan.days), NOT the calendar span — an alternate-day sub's span
  // is ~2× its delivery count, so span-inference would over-generate.
  try { const { generateAllForSubscription } = await import("./deliveries"); const target = cur.targetDeliveries ?? cur.plan?.days ?? 1; await generateAllForSubscription(id, target); } catch { /* non-blocking */ }
  // Confirm the customer is back on, with their next delivery date.
  try {
    if (cur.userId) {
      const { notify } = await import("@/lib/notifications/dispatch");
      const nd = next ? next.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
      await notify(cur.userId, { title: "Your subscription is back on ▶️", body: `Your ${cur.plan?.name || "DOODLY"} deliveries have resumed${nd ? ` — next delivery ${nd}` : ""}. Welcome back!`, email: true });
    }
  } catch { /* non-blocking */ }
  return { id, status: "ACTIVE" };
}

export async function skipDelivery(id: string, dateISO: string | undefined, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, nextDeliveryAt: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED" || cur.status === "COMPLETED") throw Errors.conflict("Cannot skip a closed subscription.");
  const when = dateISO ? new Date(dateISO) : cur.nextDeliveryAt;
  if (!when) throw Errors.badRequest("No upcoming delivery to skip.");
  // Skipping a day now EXTENDS the plan — the customer keeps their full paid count.
  const { skipOrCancelDates } = await import("./deliveries");
  const res = await skipOrCancelDates(id, [when], actor);
  return { id, skipped: startOfDay(new Date(when)).toISOString(), endDate: res.endDate };
}

/** Cancel/skip specific future date(s) — each is made up at the end (extends). */
export async function cancelDates(id: string, dates: string[], actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED" || cur.status === "COMPLETED") throw Errors.conflict("Cannot change a closed subscription.");
  const { skipOrCancelDates } = await import("./deliveries");
  return skipOrCancelDates(id, dates, actor);
}

/** Adjust a missed (our-fault) delivery → FAILED + reason, made up at the end (extends). */
export async function adjustDelivery(deliveryId: string, reason: string, note: string | undefined, actor: Actor) {
  const { adjustMissedDelivery } = await import("./deliveries");
  const res = await adjustMissedDelivery(deliveryId, reason, note, actor);
  if (!res) throw Errors.badRequest("Not a subscription delivery.");
  return res;
}

/** Reinstate a cancelled/missed delivery → back to SCHEDULED (drops a surplus make-up). */
export async function reinstate(deliveryId: string, actor: Actor) {
  const { reinstateDelivery } = await import("./deliveries");
  const res = await reinstateDelivery(deliveryId, actor);
  if (!res) throw Errors.badRequest("Not a subscription delivery.");
  return res;
}

/** Manually extend an active subscription by N delivery days. */
export async function extend(id: string, days: number, reason: string | undefined, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status !== "ACTIVE") throw Errors.conflict("Only an active subscription can be extended.");
  const { extendSubscription } = await import("./deliveries");
  const res = await extendSubscription(id, days, reason, actor);
  if (!res) throw Errors.badRequest("Enter a valid number of days.");
  return res;
}

/** Suggested refund = value of the not-yet-delivered days at the per-delivery price. */
export async function computeRemainingValue(id: string): Promise<{ remaining: number; perDeliveryPaise: number; amountPaise: number }> {
  const sub = await db.subscription.findUnique({
    where: { id },
    select: { targetDeliveries: true, plan: { select: { days: true } }, items: { select: { qty: true, variant: { select: { dailyPaise: true } } } } },
  });
  if (!sub) return { remaining: 0, perDeliveryPaise: 0, amountPaise: 0 };
  const perDeliveryPaise = sub.items.reduce((s, i) => s + i.qty * (i.variant.dailyPaise ?? 0), 0);
  const target = sub.targetDeliveries ?? sub.plan.days ?? 0;
  const delivered = await db.delivery.count({ where: { subscriptionId: id, status: "DELIVERED" } });
  const remaining = Math.max(0, target - delivered);
  return { remaining, perDeliveryPaise, amountPaise: remaining * perDeliveryPaise };
}

export interface RefundChoice { method: "wallet" | "gateway" | "none" | "manual"; amountPaise?: number; note?: string }

export async function cancelSubscription(id: string, opts: { reason?: string; scope?: "all" | "remaining"; refund?: RefundChoice }, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED") throw Errors.conflict("Subscription is already cancelled.");

  await db.subscription.update({ where: { id }, data: { status: "CANCELLED", endDate: new Date(), autoRenew: false, cancelReason: opts.reason ?? null } });
  await logSubEvent(db, id, "CANCELLED", opts.reason ? `Cancelled — ${opts.reason}` : "Subscription cancelled", { reason: opts.reason ?? null, scope: opts.scope ?? "remaining" }, actor);
  // Detach + delete every upcoming delivery (including assigned ones) — no ghost stops.
  try { const { cancelAllFutureDeliveries } = await import("./deliveries"); await cancelAllFutureDeliveries(id, actor.actorRole); } catch { /* non-blocking */ }

  // Refund — the admin picks the method (wallet auto-credits; gateway/manual are recorded).
  const r = opts.refund;
  let refund: { method: string; amountPaise: number; reference?: string; balancePaise?: number } | null = null;
  if (r && r.method !== "none") {
    const amountPaise = Math.max(0, Math.floor(r.amountPaise ?? 0));
    if (r.method === "wallet" && amountPaise > 0) {
      const res = await adminCredit({ userId: cur.userId, amountPaise, reason: "Subscription cancellation refund", kind: "refund", actorId: actor.actorId, actorRole: actor.actorRole });
      refund = { method: "wallet", amountPaise, reference: res.txn.reference, balancePaise: res.balancePaise };
      await logSubEvent(db, id, "REFUND", `Refunded ₹${Math.round(amountPaise / 100)} to wallet`, { method: "wallet", amountPaise, reference: res.txn.reference }, actor);
    } else if (r.method === "gateway" || r.method === "manual") {
      refund = { method: r.method, amountPaise };
      await logSubEvent(db, id, "REFUND", `Refund recorded — ${r.method} ₹${Math.round(amountPaise / 100)}${r.note ? ` (${r.note})` : ""}`, { method: r.method, amountPaise, note: r.note ?? null }, actor);
    }
  }
  try { const { notifySubscriptionCancelled } = await import("@/lib/notifications/dispatch"); await notifySubscriptionCancelled(cur.userId, { refundPaise: refund?.method === "wallet" ? refund.amountPaise : 0 }); } catch { /* non-blocking */ }
  return { id, status: "CANCELLED", refund };
}

/** Issue a refund against a subscription independently of cancellation (e.g. after a
    customer self-cancelled) — admin picks the method: wallet auto-credits, gateway/manual
    are recorded for external processing. */
export async function refundSubscription(id: string, r: RefundChoice, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { userId: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  const amountPaise = Math.max(0, Math.floor(r.amountPaise ?? 0));
  if (r.method === "none" || amountPaise <= 0) return { id, refund: null };
  if (r.method === "wallet") {
    const res = await adminCredit({ userId: cur.userId, amountPaise, reason: "Subscription refund", kind: "refund", actorId: actor.actorId, actorRole: actor.actorRole });
    await logSubEvent(db, id, "REFUND", `Refunded ₹${Math.round(amountPaise / 100)} to wallet`, { method: "wallet", amountPaise, reference: res.txn.reference }, actor);
    return { id, refund: { method: "wallet", amountPaise, reference: res.txn.reference, balancePaise: res.balancePaise } };
  }
  await logSubEvent(db, id, "REFUND", `Refund recorded — ${r.method} ₹${Math.round(amountPaise / 100)}${r.note ? ` (${r.note})` : ""}`, { method: r.method, amountPaise, note: r.note ?? null }, actor);
  return { id, refund: { method: r.method, amountPaise } };
}

export async function setAutopay(id: string, on: boolean, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { autoRenew: true, autopay: { select: { id: true } } } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { autoRenew: on } });
    if (cur.autopay) await tx.autopaySubscription.update({ where: { subscriptionId: id }, data: { status: on ? "ACTIVE" : "SUSPENDED" } });
    await logSubEvent(tx, id, on ? "AUTOPAY_ON" : "AUTOPAY_OFF", on ? "AutoPay enabled" : "AutoPay disabled", undefined, actor);
  });
  return { id, autoRenew: on };
}

export async function addNote(id: string, text: string, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { notes: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  const stamped = `${new Date().toISOString().slice(0, 10)} — ${text}`;
  const notes = cur.notes ? `${cur.notes}\n${stamped}` : stamped;
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { notes } });
    await logSubEvent(tx, id, "NOTE", text, undefined, actor);
  });
  return { id };
}

// ---------------------------------------------------------------- reports

export async function subscriptionReports(args: { dateFrom?: string; dateTo?: string } = {}): Promise<SubReports> {
  const now = new Date();
  const where: Prisma.SubscriptionWhereInput = {};
  if (args.dateFrom || args.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (args.dateFrom) range.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) range.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    where.startDate = range;
  }

  const subs = await db.subscription.findMany({
    where,
    include: {
      user: { select: { name: true, phone: true } },
      plan: { select: { name: true, days: true, discountBps: true } },
      address: { select: { zone: { select: { name: true } } } },
      items: { select: { qty: true, variant: { select: { dailyPaise: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byStatusMap = new Map<string, number>();
  const byPlanMap = new Map<string, { count: number; mrrPaise: number }>();
  const byZoneMap = new Map<string, number>();
  let autopayOn = 0, autopayOff = 0, activeCount = 0, activeMrr = 0;

  const rows = subs.map((s) => {
    const perDelivery = s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
    byStatusMap.set(s.status, (byStatusMap.get(s.status) ?? 0) + 1);
    const zoneName = s.address?.zone?.name ?? "Unzoned";
    byZoneMap.set(zoneName, (byZoneMap.get(zoneName) ?? 0) + 1);
    s.autoRenew ? autopayOn++ : autopayOff++;
    const mrr = perDelivery * 30;
    const pl = byPlanMap.get(s.plan.name) ?? { count: 0, mrrPaise: 0 };
    pl.count++; if (s.status === "ACTIVE") pl.mrrPaise += mrr;
    byPlanMap.set(s.plan.name, pl);
    if (s.status === "ACTIVE") { activeCount++; activeMrr += mrr; }
    return {
      shortId: shortId(s.id), customer: s.user.name ?? "—", phone: s.user.phone ?? "",
      plan: s.plan.name, status: s.status, startDate: s.startDate.toISOString().slice(0, 10),
      endDate: s.endDate?.toISOString().slice(0, 10) ?? "", slot: s.deliverySlot,
      autopay: s.autoRenew ? "Yes" : "No", perDeliveryRupees: Math.round(perDelivery / 100),
    };
  });

  const [trialAgg, eligibleActive] = await Promise.all([
    db.trialCashback.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
    db.subscription.count({ where: { status: "ACTIVE", plan: { slug: { in: ["p30", "p90"] } } } }),
  ]);

  const renewals = subs
    .filter((s) => s.status === "ACTIVE" && s.endDate && s.endDate >= now && s.endDate <= addDays(now, RENEWAL_WINDOW_DAYS))
    .map((s) => {
      const perDelivery = s.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
      return { id: s.id, shortId: shortId(s.id), customer: s.user.name ?? "—", endDate: s.endDate?.toISOString() ?? null, planTotalPaise: priceSub(perDelivery, s.plan).totalPaise };
    });

  return {
    byStatus: [...byStatusMap].map(([status, count]) => ({ status, count })),
    byPlan: [...byPlanMap].map(([plan, v]) => ({ plan, count: v.count, mrrPaise: v.mrrPaise })),
    byZone: [...byZoneMap].map(([zone, count]) => ({ zone, count })),
    autopay: { on: autopayOn, off: autopayOff },
    trial: { credited: trialAgg._count, eligibleActive, amountPaise: trialAgg._sum.amountPaise ?? 0 },
    revenue: { activeMrrPaise: activeMrr, activeCount, avgPerDeliveryPaise: activeCount ? Math.round(activeMrr / 30 / activeCount) : 0 },
    renewalsDue: renewals,
    rows,
  };
}
