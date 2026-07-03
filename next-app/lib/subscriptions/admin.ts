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
  const known = new Set(variants.map((v) => v.id));
  if (!args.items.length || args.items.some((i) => !known.has(i.variantId) || i.qty < 1)) throw Errors.badRequest("Invalid subscription items.");

  const startDate = args.startDate ? startOfDay(new Date(args.startDate)) : earliestByCutoff(new Date());
  const candidate = startDate > earliestByCutoff(new Date()) ? startDate : earliestByCutoff(new Date());
  const nextDeliveryAt = nextDeliverableFrom({ status: "ACTIVE", startDate, pausedFrom: null, pausedUntil: null, skipDates: [] }, candidate);
  const endDate = addDays(startDate, plan.days);

  const created = await db.subscription.create({
    data: {
      userId: args.userId, planId: args.planId, addressId: args.addressId, status: "ACTIVE",
      startDate, endDate, nextDeliveryAt, deliverySlot: args.deliverySlot || "06:00-08:00",
      autoRenew: args.autoRenew ?? true,
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
    data.endDate = addDays(startOfDay(cur.startDate), plan.days);
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
  return { id, changed: true };
}

// ---------------------------------------------------------------- lifecycle

export async function pauseSubscription(id: string, opts: { until?: string; reason?: string }, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED" || cur.status === "COMPLETED") throw Errors.conflict("Cannot pause a closed subscription.");
  const pausedUntil = opts.until ? new Date(opts.until) : null;
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { status: "PAUSED", pausedFrom: new Date(), pausedUntil } });
    await logSubEvent(tx, id, "PAUSED", opts.reason ? `Paused — ${opts.reason}` : "Subscription paused", { until: pausedUntil?.toISOString() ?? null, reason: opts.reason ?? null }, actor);
  });
  return { id, status: "PAUSED" };
}

export async function resumeSubscription(id: string, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, startDate: true, skipDates: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  const next = nextDeliverableFrom({ status: "ACTIVE", startDate: cur.startDate, pausedFrom: null, pausedUntil: null, skipDates: cur.skipDates }, earliestByCutoff(new Date()));
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { status: "ACTIVE", pausedFrom: null, pausedUntil: null, nextDeliveryAt: next } });
    await logSubEvent(tx, id, "RESUMED", "Subscription resumed", { nextDeliveryAt: next?.toISOString() ?? null }, actor);
  });
  return { id, status: "ACTIVE" };
}

export async function skipDelivery(id: string, dateISO: string | undefined, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, startDate: true, skipDates: true, pausedFrom: true, pausedUntil: true, nextDeliveryAt: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED" || cur.status === "COMPLETED") throw Errors.conflict("Cannot skip a closed subscription.");
  const when = dateISO ? startOfDay(new Date(dateISO)) : (cur.nextDeliveryAt ? startOfDay(cur.nextDeliveryAt) : null);
  if (!when) throw Errors.badRequest("No upcoming delivery to skip.");
  const nextSkips = [...cur.skipDates.map((d) => startOfDay(d)), when];
  const next = nextDeliverableFrom({ status: cur.status as SubRule["status"], startDate: cur.startDate, pausedFrom: cur.pausedFrom, pausedUntil: cur.pausedUntil, skipDates: nextSkips }, addDays(when, 1));
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id }, data: { skipDates: { push: when }, nextDeliveryAt: next } });
    await logSubEvent(tx, id, "SKIPPED", `Delivery on ${when.toDateString()} skipped`, { date: when.toISOString(), nextDeliveryAt: next?.toISOString() ?? null }, actor);
  });
  return { id, skipped: when.toISOString() };
}

export async function cancelSubscription(id: string, opts: { reason?: string; refundPaise?: number }, actor: Actor) {
  const cur = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true } });
  if (!cur) throw Errors.notFound("Subscription not found.");
  if (cur.status === "CANCELLED") throw Errors.conflict("Subscription is already cancelled.");

  await db.subscription.update({ where: { id }, data: { status: "CANCELLED", endDate: new Date(), autoRenew: false, cancelReason: opts.reason ?? null } });
  await logSubEvent(db, id, "CANCELLED", opts.reason ? `Cancelled — ${opts.reason}` : "Subscription cancelled", { reason: opts.reason ?? null }, actor);

  let refund: { reference: string; balancePaise: number } | null = null;
  if (opts.refundPaise && opts.refundPaise > 0) {
    const res = await adminCredit({ userId: cur.userId, amountPaise: opts.refundPaise, reason: "Subscription cancellation refund", actorId: actor.actorId, actorRole: actor.actorRole });
    refund = { reference: res.txn.reference, balancePaise: res.balancePaise };
    await logSubEvent(db, id, "REFUND", `Refunded ₹${Math.round(opts.refundPaise / 100)} to wallet`, { amountPaise: opts.refundPaise, reference: res.txn.reference }, actor);
  }
  return { id, status: "CANCELLED", refund };
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
