/* =============================================================
   DOODLY Growth → Offers — service layer (Prisma). Campaign-driven
   promotion engine over Offer + OfferRedemption. REUSES the pure
   Coupon engine (validateCoupon / computeDiscount) for the discount
   maths + eligibility — offers only add type, priority, campaign and
   the draft→active⇄paused→archived lifecycle. Also resolves the
   best auto-applied offer for a cart (priority-ordered). Reuses Orders
   (first-order + revenue) and the central AuditLog.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";
import { validateCoupon, type CouponRule, type CartContext } from "@/lib/coupons/engine";

interface Actor { actorId?: string; actorRole?: string }

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

type OfferRow = Prisma.OfferGetPayload<{ include: { _count: { select: { redemptions: true } } } }>;
type OfferLike = { deletedAt: Date | null; state: string; startsAt: Date | null; expiresAt: Date | null };

/** Derived display status from lifecycle state + scheduling window. */
export function offerStatus(o: OfferLike, now = new Date()): "Deleted" | "Archived" | "Draft" | "Paused" | "Scheduled" | "Expired" | "Active" {
  if (o.deletedAt) return "Deleted";
  if (o.state === "ARCHIVED") return "Archived";
  if (o.state === "DRAFT") return "Draft";
  if (o.state === "PAUSED") return "Paused";
  if (o.startsAt && o.startsAt > now) return "Scheduled";
  if (o.expiresAt && o.expiresAt <= now) return "Expired";
  return "Active";
}

/** Map an Offer row → the shared coupon-engine rule (state ACTIVE = "active"). */
export function toRule(o: {
  code: string | null; discountType: "PERCENT" | "FLAT"; discountBps: number | null; flatPaise: number | null; maxDiscountPaise: number | null;
  minOrderPaise: number; eligibility: "ALL" | "FIRST_ORDER" | "SPECIFIC"; eligibleUserIds: string[];
  applicableProductSlugs: string[]; applicableCategorySlugs: string[]; applicablePlanSlugs: string[];
  perCustomerLimit: number | null; maxRedemptions: number | null; redeemed: number; startsAt: Date | null; expiresAt: Date | null; state: string; deletedAt: Date | null;
}): CouponRule {
  return {
    code: o.code ?? "", discountType: o.discountType, discountBps: o.discountBps, flatPaise: o.flatPaise, maxDiscountPaise: o.maxDiscountPaise,
    minOrderPaise: o.minOrderPaise, firstOrderOnly: o.eligibility === "FIRST_ORDER", eligibility: o.eligibility, eligibleUserIds: o.eligibleUserIds,
    applicableProductSlugs: o.applicableProductSlugs, applicableCategorySlugs: o.applicableCategorySlugs, applicablePlanSlugs: o.applicablePlanSlugs,
    perCustomerLimit: o.perCustomerLimit, maxRedemptions: o.maxRedemptions, redeemed: o.redeemed, startsAt: o.startsAt, expiresAt: o.expiresAt, active: o.state === "ACTIVE", deletedAt: o.deletedAt,
  };
}

function shape(o: OfferRow) {
  const discountLabel = o.discountType === "PERCENT" ? `${(o.discountBps ?? 0) / 100}%` : `₹${Math.round((o.flatPaise ?? 0) / 100)}`;
  return {
    id: o.id, name: o.name, code: o.code, description: o.description, campaignName: o.campaignName, offerType: o.offerType,
    discountType: o.discountType, discountBps: o.discountBps, flatPaise: o.flatPaise, discountLabel, maxDiscountPaise: o.maxDiscountPaise, minOrderPaise: o.minOrderPaise,
    eligibility: o.eligibility, eligibleUserIds: o.eligibleUserIds, applicableProductSlugs: o.applicableProductSlugs, applicableCategorySlugs: o.applicableCategorySlugs, applicablePlanSlugs: o.applicablePlanSlugs,
    perCustomerLimit: o.perCustomerLimit, maxRedemptions: o.maxRedemptions, redeemed: o.redeemed, usageCount: o._count.redemptions, priority: o.priority,
    startsAt: o.startsAt, expiresAt: o.expiresAt, state: o.state, bannerText: o.bannerText, bannerImageUrl: o.bannerImageUrl,
    createdById: o.createdById, deletedAt: o.deletedAt, createdAt: o.createdAt, updatedAt: o.updatedAt, status: offerStatus(o),
  };
}

export const OfferSchema = z.object({
  name: z.string().trim().min(2).max(140),
  code: z.string().trim().max(40).regex(/^[A-Za-z0-9_-]*$/).transform((s) => (s ? s.toUpperCase() : "")).optional(),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  campaignName: z.string().trim().max(120).optional().or(z.literal("")),
  offerType: z.enum(["PERCENT", "FLAT", "BOGO", "BUNDLE", "SUBSCRIPTION", "FIRST_ORDER", "SEASONAL", "FESTIVAL", "LIMITED_TIME", "CUSTOMER_SPECIFIC", "PRODUCT_SPECIFIC", "CATEGORY_SPECIFIC", "CASHBACK"]).default("PERCENT"),
  discountType: z.enum(["PERCENT", "FLAT"]).default("PERCENT"),
  discountBps: z.coerce.number().int().min(0).max(100 * 100).optional(),
  flatPaise: z.coerce.number().int().min(0).optional(),
  maxDiscountPaise: z.coerce.number().int().min(0).nullable().optional(),
  minOrderPaise: z.coerce.number().int().min(0).default(0),
  eligibility: z.enum(["ALL", "FIRST_ORDER", "SPECIFIC"]).default("ALL"),
  eligibleUserIds: z.array(z.string()).default([]),
  applicableProductSlugs: z.array(z.string()).default([]),
  applicableCategorySlugs: z.array(z.string()).default([]),
  applicablePlanSlugs: z.array(z.string()).default([]),
  perCustomerLimit: z.coerce.number().int().positive().nullable().optional(),
  maxRedemptions: z.coerce.number().int().positive().nullable().optional(),
  priority: z.coerce.number().int().default(0),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  state: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  bannerText: z.string().trim().max(200).optional().or(z.literal("")),
});
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };
const date = (v?: string | null) => (v ? new Date(v) : null);

// ---------------------------------------------------------------- list + detail
export interface OfferFilters { q?: string; status?: string; offerType?: string; campaign?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number; includeDeleted?: boolean }

export async function listOffers(f: OfferFilters = {}) {
  const where: Prisma.OfferWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.offerType) where.offerType = f.offerType as never;
  if (f.campaign) where.campaignName = f.campaign;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { campaignName: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }]; }
  const orderBy: Prisma.OfferOrderByWithRelationInput =
    f.sort === "redeemed" ? { redeemed: "desc" } : f.sort === "expiry" ? { expiresAt: "asc" } : f.sort === "priority" ? { priority: "desc" } : f.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" };
  let rows = await db.offer.findMany({ where, orderBy, include: { _count: { select: { redemptions: true } } }, take: 1000 });
  let list = rows.map(shape);
  if (f.status) list = list.filter((o) => o.status.toLowerCase() === f.status!.toLowerCase());
  const total = list.length; const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  return { offers: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function offerDetail(id: string) {
  const o = await db.offer.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
  if (!o) throw new Error("Offer not found");
  const [redemptions, agg] = await Promise.all([
    db.offerRedemption.findMany({ where: { offerId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.offerRedemption.aggregate({ where: { offerId: id }, _sum: { discountPaise: true, orderTotalPaise: true }, _count: true }),
  ]);
  const userIds = [...new Set(redemptions.map((r) => r.userId).filter(Boolean) as string[])];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } }) : [];
  const nameBy = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.phone ?? "Customer"]));
  return {
    ...shape(o),
    stats: { redemptions: agg._count, discountGivenPaise: agg._sum.discountPaise ?? 0, revenueGeneratedPaise: agg._sum.orderTotalPaise ?? 0, uniqueCustomers: userIds.length },
    usage: redemptions.map((r) => ({ id: r.id, customer: r.userId ? nameBy[r.userId] ?? "Customer" : "Guest", userId: r.userId, orderId: r.orderId, discountPaise: r.discountPaise, orderTotalPaise: r.orderTotalPaise, createdAt: r.createdAt })),
  };
}

// ---------------------------------------------------------------- CRUD + lifecycle
export async function createOffer(raw: unknown, actor: Actor) {
  const d = OfferSchema.parse(raw);
  if (d.code) { const dup = await db.offer.findUnique({ where: { code: d.code }, select: { id: true } }); if (dup) throw new Error(`Offer code ${d.code} already exists.`); }
  return db.offer.create({
    data: {
      name: d.name, code: d.code || null, description: clean(d.description), campaignName: clean(d.campaignName), offerType: d.offerType,
      discountType: d.discountType, discountBps: d.discountType === "PERCENT" ? (d.discountBps ?? 0) : null, flatPaise: d.discountType === "FLAT" ? (d.flatPaise ?? 0) : null,
      maxDiscountPaise: d.maxDiscountPaise ?? null, minOrderPaise: d.minOrderPaise, eligibility: d.eligibility, eligibleUserIds: d.eligibleUserIds,
      applicableProductSlugs: d.applicableProductSlugs, applicableCategorySlugs: d.applicableCategorySlugs, applicablePlanSlugs: d.applicablePlanSlugs,
      perCustomerLimit: d.perCustomerLimit ?? null, maxRedemptions: d.maxRedemptions ?? null, priority: d.priority, startsAt: date(d.startsAt), expiresAt: date(d.expiresAt),
      state: d.state ?? "DRAFT", bannerText: clean(d.bannerText), createdById: actor.actorId ?? null,
    },
    include: { _count: { select: { redemptions: true } } },
  }).then(shape);
}

export async function updateOffer(id: string, raw: unknown) {
  const d = OfferSchema.partial().parse(raw);
  const data: Prisma.OfferUpdateInput = {};
  if (d.code !== undefined) { const code = d.code || null; if (code) { const dup = await db.offer.findFirst({ where: { code, NOT: { id } }, select: { id: true } }); if (dup) throw new Error(`Offer code ${code} already exists.`); } data.code = code; }
  if (d.name !== undefined) data.name = d.name;
  for (const k of ["description", "campaignName", "bannerText"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = clean(d[k] as string);
  if (d.offerType !== undefined) data.offerType = d.offerType;
  if (d.discountType !== undefined) data.discountType = d.discountType;
  if (d.discountBps !== undefined) data.discountBps = d.discountBps;
  if (d.flatPaise !== undefined) data.flatPaise = d.flatPaise;
  if (d.maxDiscountPaise !== undefined) data.maxDiscountPaise = d.maxDiscountPaise;
  if (d.minOrderPaise !== undefined) data.minOrderPaise = d.minOrderPaise;
  if (d.eligibility !== undefined) data.eligibility = d.eligibility;
  for (const k of ["eligibleUserIds", "applicableProductSlugs", "applicableCategorySlugs", "applicablePlanSlugs"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = d[k];
  if (d.perCustomerLimit !== undefined) data.perCustomerLimit = d.perCustomerLimit;
  if (d.maxRedemptions !== undefined) data.maxRedemptions = d.maxRedemptions;
  if (d.priority !== undefined) data.priority = d.priority;
  if (d.startsAt !== undefined) data.startsAt = date(d.startsAt);
  if (d.expiresAt !== undefined) data.expiresAt = date(d.expiresAt);
  if (d.state !== undefined) data.state = d.state;
  return db.offer.update({ where: { id }, data, include: { _count: { select: { redemptions: true } } } }).then(shape);
}

const setState = (id: string, state: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED") => db.offer.update({ where: { id }, data: { state }, include: { _count: { select: { redemptions: true } } } }).then(shape);
export const activateOffer = (id: string) => setState(id, "ACTIVE");
export const deactivateOffer = (id: string) => setState(id, "DRAFT");
export const pauseOffer = (id: string) => setState(id, "PAUSED");
export const resumeOffer = (id: string) => setState(id, "ACTIVE");
export const archiveOffer = (id: string) => setState(id, "ARCHIVED");
export const softDeleteOffer = (id: string) => db.offer.update({ where: { id }, data: { deletedAt: new Date() }, include: { _count: { select: { redemptions: true } } } }).then(shape);
export const restoreOffer = (id: string) => db.offer.update({ where: { id }, data: { deletedAt: null, state: "DRAFT" }, include: { _count: { select: { redemptions: true } } } }).then(shape);

export async function duplicateOffer(id: string, actor: Actor) {
  const o = await db.offer.findUnique({ where: { id } });
  if (!o) throw new Error("Offer not found");
  let code = o.code ? `${o.code}-COPY` : null;
  if (code) for (let i = 2; await db.offer.findUnique({ where: { code }, select: { id: true } }); i++) code = `${o.code}-COPY${i}`;
  const { id: _i, createdAt: _c, updatedAt: _u, redeemed: _r, ...rest } = o;
  return db.offer.create({ data: { ...rest, name: `${o.name} (copy)`, code, state: "DRAFT", redeemed: 0, createdById: actor.actorId ?? null }, include: { _count: { select: { redemptions: true } } } }).then(shape);
}

export async function bulkOffers(action: string, ids: string[]) {
  const map: Record<string, Prisma.OfferUpdateManyMutationInput> = {
    activate: { state: "ACTIVE" }, deactivate: { state: "DRAFT" }, pause: { state: "PAUSED" }, resume: { state: "ACTIVE" }, archive: { state: "ARCHIVED" }, delete: { deletedAt: new Date() }, restore: { deletedAt: null },
  };
  if (!map[action]) throw new Error("Unknown bulk action");
  return db.offer.updateMany({ where: { id: { in: ids } }, data: map[action] }).then((r) => ({ count: r.count }));
}

// ---------------------------------------------------------------- dashboard + reports
export async function offerDashboard() {
  const now = new Date(); const todayStart = soD(now);
  const [all, redemAgg, redeemToday, byOffer] = await Promise.all([
    db.offer.findMany({ where: { deletedAt: null }, include: { _count: { select: { redemptions: true } } } }),
    db.offerRedemption.aggregate({ _sum: { discountPaise: true, orderTotalPaise: true }, _count: true }),
    db.offerRedemption.count({ where: { createdAt: { gte: todayStart } } }),
    db.offerRedemption.groupBy({ by: ["offerId"], _count: { _all: true }, _sum: { orderTotalPaise: true }, orderBy: { _sum: { orderTotalPaise: "desc" } }, take: 1 }),
  ]);
  const statuses = all.map((o) => offerStatus(o));
  const count = (s: string) => statuses.filter((x) => x === s).length;
  const activeCampaigns = new Set(all.filter((o) => offerStatus(o) === "Active" && o.campaignName).map((o) => o.campaignName)).size;
  const totalRedeemed = redemAgg._count; const discount = redemAgg._sum.discountPaise ?? 0; const revenue = redemAgg._sum.orderTotalPaise ?? 0;
  let top: string | null = null;
  const b0 = (byOffer as never as { offerId: string }[])[0]; if (b0) top = all.find((o) => o.id === b0.offerId)?.name ?? null;
  return {
    meta: { generatedAt: now.toISOString() },
    kpis: {
      totalOffers: all.length, activeOffers: count("Active"), scheduledOffers: count("Scheduled"), expiredOffers: count("Expired"), draftOffers: count("Draft"), pausedOffers: count("Paused"),
      offerRedemptions: totalRedeemed, revenueGeneratedPaise: revenue, totalDiscountPaise: discount,
      conversionRate: revenue ? Math.round((discount / revenue) * 1000) / 10 : 0, activeCampaigns, topPerformingOffer: top, offersUsedToday: redeemToday,
      avgDiscountPaise: totalRedeemed ? Math.round(discount / totalRedeemed) : 0,
    },
  };
}

export async function offerReports(range: { from?: string | Date; to?: string | Date } = {}) {
  const where: Prisma.OfferRedemptionWhereInput = {};
  if (range.from || range.to) { const r: Prisma.DateTimeFilter = {}; if (range.from) r.gte = soD(new Date(range.from)); if (range.to) r.lte = eoD(new Date(range.to)); where.createdAt = r; }
  const [byOffer, offers, totals] = await Promise.all([
    db.offerRedemption.groupBy({ by: ["offerId"], where, _count: { _all: true }, _sum: { discountPaise: true, orderTotalPaise: true } }),
    db.offer.findMany({ where: { deletedAt: null }, select: { id: true, name: true, campaignName: true, offerType: true } }),
    db.offerRedemption.aggregate({ where, _count: true, _sum: { discountPaise: true, orderTotalPaise: true } }),
  ]);
  const nameBy = Object.fromEntries(offers.map((o) => [o.id, o.name]));
  const campBy = Object.fromEntries(offers.map((o) => [o.id, o.campaignName ?? "—"]));
  const rows = (byOffer as never as { offerId: string; _count: { _all: number }; _sum: { discountPaise: number | null; orderTotalPaise: number | null } }[])
    .map((r) => ({ offerId: r.offerId, name: nameBy[r.offerId] ?? "—", campaign: campBy[r.offerId] ?? "—", redemptions: r._count._all, discountPaise: r._sum.discountPaise ?? 0, revenuePaise: r._sum.orderTotalPaise ?? 0 }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise);
  const byCampaign: Record<string, { redemptions: number; discountPaise: number; revenuePaise: number }> = {};
  rows.forEach((r) => { const c = byCampaign[r.campaign] || { redemptions: 0, discountPaise: 0, revenuePaise: 0 }; c.redemptions += r.redemptions; c.discountPaise += r.discountPaise; c.revenuePaise += r.revenuePaise; byCampaign[r.campaign] = c; });
  return { totals: { redemptions: totals._count, discountPaise: totals._sum.discountPaise ?? 0, revenuePaise: totals._sum.orderTotalPaise ?? 0 }, byOffer: rows, byCampaign: Object.keys(byCampaign).map((k) => ({ campaign: k, ...byCampaign[k] })).sort((a, b) => b.revenuePaise - a.revenuePaise) };
}

// ---------------------------------------------------------------- validate + auto-apply (checkout)
async function resolveCtx(cart: CartContext, offerId?: string) {
  let userRedemptions = cart.userRedemptions, isFirstOrder = cart.isFirstOrder;
  if (cart.userId) {
    if (isFirstOrder == null) isFirstOrder = (await db.order.count({ where: { userId: cart.userId, status: "PAID" } })) === 0;
    if (offerId && userRedemptions == null) userRedemptions = await db.offerRedemption.count({ where: { offerId, userId: cart.userId } });
  }
  return { ...cart, userRedemptions, isFirstOrder };
}

/** Validate a specific offer (by code or id) for a cart. */
export async function validateOfferForCart(codeOrId: string, cart: CartContext) {
  const offer = await db.offer.findFirst({ where: { OR: [{ code: codeOrId.trim().toUpperCase() }, { id: codeOrId }] } });
  if (!offer) return { ok: false, reason: "not_found" as const, discountPaise: 0, message: "Offer not found." };
  const ctx = await resolveCtx(cart, offer.id);
  const dec = validateCoupon(toRule(offer), ctx);
  return { ...dec, offerId: offer.id, offerName: offer.name };
}

/** Auto-apply: return every currently-eligible offer for a cart, best (priority then discount) first. */
export async function bestOffersForCart(cart: CartContext) {
  const now = new Date();
  const candidates = await db.offer.findMany({ where: { deletedAt: null, state: "ACTIVE", OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] }, orderBy: [{ priority: "desc" }] });
  const ctx = await resolveCtx(cart);
  const eligible = [];
  for (const o of candidates) {
    const dec = validateCoupon(toRule(o), { ...ctx, userRedemptions: cart.userId ? await db.offerRedemption.count({ where: { offerId: o.id, userId: cart.userId } }) : 0 });
    if (dec.ok) eligible.push({ offerId: o.id, name: o.name, offerType: o.offerType, priority: o.priority, discountPaise: dec.discountPaise, code: o.code });
  }
  eligible.sort((a, b) => b.priority - a.priority || b.discountPaise - a.discountPaise);
  return { best: eligible[0] ?? null, eligible };
}

/** Apply + record a redemption atomically. Idempotent per orderId. */
export async function redeemOffer(offerId: string, cart: CartContext, orderId: string | undefined, _actor: Actor) {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new Error("Offer not found.");
    if (orderId) { const dup = await tx.offerRedemption.findUnique({ where: { orderId } }); if (dup) return { redeemed: false, idempotent: true, discountPaise: dup.discountPaise }; }
    let userRedemptions = cart.userRedemptions, isFirstOrder = cart.isFirstOrder;
    if (cart.userId) {
      if (isFirstOrder == null) isFirstOrder = (await tx.order.count({ where: { userId: cart.userId, status: "PAID" } })) === 0;
      if (userRedemptions == null) userRedemptions = await tx.offerRedemption.count({ where: { offerId, userId: cart.userId } });
    }
    const dec = validateCoupon(toRule(offer), { ...cart, userRedemptions, isFirstOrder });
    if (!dec.ok) throw new Error(dec.message ?? "Offer not valid.");
    await tx.offerRedemption.create({ data: { offerId, userId: cart.userId ?? null, orderId: orderId ?? null, discountPaise: dec.discountPaise, orderTotalPaise: cart.orderTotalPaise } });
    await tx.offer.update({ where: { id: offerId }, data: { redeemed: { increment: 1 } } });
    return { redeemed: true, discountPaise: dec.discountPaise };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
