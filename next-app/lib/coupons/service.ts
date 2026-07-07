/* =============================================================
   DOODLY Coupons — service layer (Prisma). Promotion engine over the
   Coupon + CouponRedemption tables. CRUD, lifecycle (activate / deactivate
   / soft-delete / restore / duplicate), bulk ops, dashboard analytics,
   reports, real-time validation and atomic redemption (idempotent per order).
   Reuses Orders (first-order + revenue context) and the central AuditLog.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { validateCoupon, computeDiscount, couponStatus, type CouponRule, type CartContext } from "./engine";
import { z } from "zod";

interface Actor { actorId?: string; actorRole?: string }

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const dKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type CouponRow = Prisma.CouponGetPayload<{ include: { _count: { select: { redemptions: true } } } }>;

/** Map a DB coupon row → the pure-engine rule shape. */
export function toRule(c: {
  code: string; discountType: "PERCENT" | "FLAT"; discountBps: number | null; flatPaise: number | null; maxDiscountPaise: number | null;
  minOrderPaise: number; firstOrderOnly: boolean; eligibility: "ALL" | "FIRST_ORDER" | "SPECIFIC"; eligibleUserIds: string[];
  applicableProductSlugs: string[]; applicableCategorySlugs: string[]; applicablePlanSlugs: string[];
  perCustomerLimit: number | null; maxRedemptions: number | null; redeemed: number; startsAt: Date | null; expiresAt: Date | null; active: boolean; deletedAt: Date | null;
}): CouponRule {
  return {
    code: c.code, discountType: c.discountType, discountBps: c.discountBps, flatPaise: c.flatPaise, maxDiscountPaise: c.maxDiscountPaise,
    minOrderPaise: c.minOrderPaise, firstOrderOnly: c.firstOrderOnly, eligibility: c.eligibility, eligibleUserIds: c.eligibleUserIds,
    applicableProductSlugs: c.applicableProductSlugs, applicableCategorySlugs: c.applicableCategorySlugs, applicablePlanSlugs: c.applicablePlanSlugs,
    perCustomerLimit: c.perCustomerLimit, maxRedemptions: c.maxRedemptions, redeemed: c.redeemed, startsAt: c.startsAt, expiresAt: c.expiresAt, active: c.active, deletedAt: c.deletedAt,
  };
}

function shape(c: CouponRow) {
  const discountLabel = c.discountType === "PERCENT" ? `${(c.discountBps ?? 0) / 100}%` : `₹${Math.round((c.flatPaise ?? 0) / 100)}`;
  return {
    id: c.id, code: c.code, name: c.name, description: c.description, campaignName: c.campaignName,
    discountType: c.discountType, discountBps: c.discountBps, flatPaise: c.flatPaise, discountLabel,
    maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise, firstOrderOnly: c.firstOrderOnly,
    eligibility: c.eligibility, eligibleUserIds: c.eligibleUserIds,
    applicableProductSlugs: c.applicableProductSlugs, applicableCategorySlugs: c.applicableCategorySlugs, applicablePlanSlugs: c.applicablePlanSlugs,
    perCustomerLimit: c.perCustomerLimit, maxRedemptions: c.maxRedemptions, redeemed: c.redeemed, usageCount: c._count.redemptions,
    startsAt: c.startsAt, expiresAt: c.expiresAt, active: c.active, createdById: c.createdById, deletedAt: c.deletedAt,
    createdAt: c.createdAt, updatedAt: c.updatedAt, status: couponStatus(c),
  };
}

// ---------------------------------------------------------------- validation
export const CouponSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only").transform((s) => s.toUpperCase()),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  campaignName: z.string().trim().max(120).optional().or(z.literal("")),
  discountType: z.enum(["PERCENT", "FLAT"]).default("PERCENT"),
  discountBps: z.coerce.number().int().min(0).max(100 * 100).optional(),   // ≤ 100%
  flatPaise: z.coerce.number().int().min(0).optional(),
  maxDiscountPaise: z.coerce.number().int().min(0).optional().nullable(),
  minOrderPaise: z.coerce.number().int().min(0).default(0),
  firstOrderOnly: z.coerce.boolean().default(false),
  eligibility: z.enum(["ALL", "FIRST_ORDER", "SPECIFIC"]).default("ALL"),
  eligibleUserIds: z.array(z.string()).default([]),
  applicableProductSlugs: z.array(z.string()).default([]),
  applicableCategorySlugs: z.array(z.string()).default([]),
  applicablePlanSlugs: z.array(z.string()).default([]),
  perCustomerLimit: z.coerce.number().int().positive().optional().nullable(),
  maxRedemptions: z.coerce.number().int().positive().optional().nullable(),
  startsAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  active: z.coerce.boolean().default(true),
});
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };
const date = (v?: string | null) => (v ? new Date(v) : null);

// ---------------------------------------------------------------- list + detail
export interface CouponFilters { q?: string; status?: string; discountType?: string; campaign?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number; includeDeleted?: boolean }

export async function listCoupons(f: CouponFilters = {}) {
  const where: Prisma.CouponWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.discountType) where.discountType = f.discountType as never;
  if (f.campaign) where.campaignName = f.campaign;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { campaignName: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
  }
  const orderBy: Prisma.CouponOrderByWithRelationInput =
    f.sort === "usage" ? { redeemed: "desc" } : f.sort === "expiry" ? { expiresAt: "asc" } : f.sort === "name" ? { code: "asc" } : f.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" };

  let rows = await db.coupon.findMany({ where, orderBy, include: { _count: { select: { redemptions: true } } }, take: 1000 });
  let list = rows.map(shape);
  if (f.status) list = list.filter((c) => c.status.toLowerCase() === f.status!.toLowerCase());
  const total = list.length;
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  return { coupons: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function couponDetail(id: string) {
  const c = await db.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
  if (!c) throw new Error("Coupon not found");
  const [redemptions, agg] = await Promise.all([
    db.couponRedemption.findMany({ where: { couponId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.couponRedemption.aggregate({ where: { couponId: id }, _sum: { discountPaise: true, orderTotalPaise: true }, _count: true }),
  ]);
  const userIds = [...new Set(redemptions.map((r) => r.userId).filter(Boolean) as string[])];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } }) : [];
  const nameBy = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.phone ?? "Customer"]));
  return {
    ...shape(c),
    stats: { redemptions: agg._count, discountGivenPaise: agg._sum.discountPaise ?? 0, revenueGeneratedPaise: agg._sum.orderTotalPaise ?? 0, uniqueCustomers: userIds.length },
    usage: redemptions.map((r) => ({ id: r.id, customer: r.userId ? nameBy[r.userId] ?? "Customer" : "Guest", userId: r.userId, orderId: r.orderId, discountPaise: r.discountPaise, orderTotalPaise: r.orderTotalPaise, createdAt: r.createdAt })),
  };
}

// ---------------------------------------------------------------- CRUD + lifecycle
export async function createCoupon(raw: unknown, actor: Actor) {
  const d = CouponSchema.parse(raw);
  const dup = await db.coupon.findUnique({ where: { code: d.code }, select: { id: true } });
  if (dup) throw new Error(`Coupon code ${d.code} already exists.`);
  return db.coupon.create({
    data: {
      code: d.code, name: clean(d.name), description: clean(d.description), campaignName: clean(d.campaignName),
      discountType: d.discountType, discountBps: d.discountType === "PERCENT" ? (d.discountBps ?? 0) : null, flatPaise: d.discountType === "FLAT" ? (d.flatPaise ?? 0) : null,
      maxDiscountPaise: d.maxDiscountPaise ?? null, minOrderPaise: d.minOrderPaise, firstOrderOnly: d.firstOrderOnly || d.eligibility === "FIRST_ORDER",
      eligibility: d.eligibility, eligibleUserIds: d.eligibleUserIds, applicableProductSlugs: d.applicableProductSlugs, applicableCategorySlugs: d.applicableCategorySlugs, applicablePlanSlugs: d.applicablePlanSlugs,
      perCustomerLimit: d.perCustomerLimit ?? null, maxRedemptions: d.maxRedemptions ?? null, startsAt: date(d.startsAt), expiresAt: date(d.expiresAt), active: d.active, createdById: actor.actorId ?? null,
    },
    include: { _count: { select: { redemptions: true } } },
  }).then(shape);
}

export async function updateCoupon(id: string, raw: unknown, actor: Actor) {
  const d = CouponSchema.partial().parse(raw);
  const data: Prisma.CouponUpdateInput = {};
  if (d.code !== undefined) {
    const dup = await db.coupon.findFirst({ where: { code: d.code, NOT: { id } }, select: { id: true } });
    if (dup) throw new Error(`Coupon code ${d.code} already exists.`);
    data.code = d.code;
  }
  for (const k of ["name", "description", "campaignName"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = clean(d[k] as string);
  if (d.discountType !== undefined) data.discountType = d.discountType;
  if (d.discountBps !== undefined) data.discountBps = d.discountBps;
  if (d.flatPaise !== undefined) data.flatPaise = d.flatPaise;
  if (d.maxDiscountPaise !== undefined) data.maxDiscountPaise = d.maxDiscountPaise;
  if (d.minOrderPaise !== undefined) data.minOrderPaise = d.minOrderPaise;
  if (d.firstOrderOnly !== undefined) data.firstOrderOnly = d.firstOrderOnly;
  if (d.eligibility !== undefined) data.eligibility = d.eligibility;
  for (const k of ["eligibleUserIds", "applicableProductSlugs", "applicableCategorySlugs", "applicablePlanSlugs"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = d[k];
  if (d.perCustomerLimit !== undefined) data.perCustomerLimit = d.perCustomerLimit;
  if (d.maxRedemptions !== undefined) data.maxRedemptions = d.maxRedemptions;
  if (d.startsAt !== undefined) data.startsAt = date(d.startsAt);
  if (d.expiresAt !== undefined) data.expiresAt = date(d.expiresAt);
  if (d.active !== undefined) data.active = d.active;
  return db.coupon.update({ where: { id }, data, include: { _count: { select: { redemptions: true } } } }).then(shape);
}

export async function setCouponActive(id: string, active: boolean) {
  return db.coupon.update({ where: { id }, data: { active }, include: { _count: { select: { redemptions: true } } } }).then(shape);
}
export async function softDeleteCoupon(id: string) {
  return db.coupon.update({ where: { id }, data: { deletedAt: new Date(), active: false }, include: { _count: { select: { redemptions: true } } } }).then(shape);
}
export async function restoreCoupon(id: string) {
  return db.coupon.update({ where: { id }, data: { deletedAt: null }, include: { _count: { select: { redemptions: true } } } }).then(shape);
}
export async function duplicateCoupon(id: string, actor: Actor) {
  const c = await db.coupon.findUnique({ where: { id } });
  if (!c) throw new Error("Coupon not found");
  let code = `${c.code}-COPY`;
  for (let i = 2; await db.coupon.findUnique({ where: { code }, select: { id: true } }); i++) code = `${c.code}-COPY${i}`;
  return db.coupon.create({
    data: {
      code, name: c.name ? `${c.name} (copy)` : null, description: c.description, campaignName: c.campaignName, discountType: c.discountType, discountBps: c.discountBps, flatPaise: c.flatPaise,
      maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise, firstOrderOnly: c.firstOrderOnly, eligibility: c.eligibility, eligibleUserIds: c.eligibleUserIds,
      applicableProductSlugs: c.applicableProductSlugs, applicableCategorySlugs: c.applicableCategorySlugs, applicablePlanSlugs: c.applicablePlanSlugs,
      perCustomerLimit: c.perCustomerLimit, maxRedemptions: c.maxRedemptions, startsAt: c.startsAt, expiresAt: c.expiresAt, active: false, createdById: actor.actorId ?? null,
    },
    include: { _count: { select: { redemptions: true } } },
  }).then(shape);
}

export async function bulkCoupons(action: string, ids: string[], extra?: { expiresAt?: string }) {
  if (action === "activate") return db.coupon.updateMany({ where: { id: { in: ids } }, data: { active: true } }).then((r) => ({ count: r.count }));
  if (action === "deactivate") return db.coupon.updateMany({ where: { id: { in: ids } }, data: { active: false } }).then((r) => ({ count: r.count }));
  if (action === "delete") return db.coupon.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date(), active: false } }).then((r) => ({ count: r.count }));
  if (action === "restore") return db.coupon.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } }).then((r) => ({ count: r.count }));
  if (action === "expiry") return db.coupon.updateMany({ where: { id: { in: ids } }, data: { expiresAt: extra?.expiresAt ? new Date(extra.expiresAt) : null } }).then((r) => ({ count: r.count }));
  throw new Error("Unknown bulk action");
}

// ---------------------------------------------------------------- dashboard + reports
export async function couponDashboard() {
  const now = new Date(); const todayStart = soD(now);
  const [all, redemAgg, redeemToday, byCoupon] = await Promise.all([
    db.coupon.findMany({ where: { deletedAt: null }, include: { _count: { select: { redemptions: true } } } }),
    db.couponRedemption.aggregate({ _sum: { discountPaise: true, orderTotalPaise: true }, _count: true }),
    db.couponRedemption.count({ where: { createdAt: { gte: todayStart } } }),
    db.couponRedemption.groupBy({ by: ["couponId"], _count: { _all: true }, orderBy: { _count: { couponId: "desc" } }, take: 1 }),
  ]);
  const statuses = all.map((c) => couponStatus(c));
  const active = statuses.filter((s) => s === "Active").length;
  const scheduled = statuses.filter((s) => s === "Scheduled").length;
  const expired = statuses.filter((s) => s === "Expired").length;
  const totalRedeemed = redemAgg._count;
  const discountGiven = redemAgg._sum.discountPaise ?? 0;
  const revenue = redemAgg._sum.orderTotalPaise ?? 0;
  let mostUsed: string | null = null;
  if ((byCoupon as never as { couponId: string }[])[0]) mostUsed = all.find((c) => c.id === (byCoupon as never as { couponId: string }[])[0].couponId)?.code ?? null;

  return {
    meta: { generatedAt: now.toISOString() },
    kpis: {
      totalCoupons: all.length, activeCoupons: active, scheduledCoupons: scheduled, expiredCoupons: expired,
      couponsRedeemed: totalRedeemed, totalDiscountPaise: discountGiven, revenueGeneratedPaise: revenue,
      avgDiscountPaise: totalRedeemed ? Math.round(discountGiven / totalRedeemed) : 0,
      conversionRate: revenue ? Math.round((discountGiven / revenue) * 1000) / 10 : 0,
      mostUsedCoupon: mostUsed, couponsUsedToday: redeemToday,
    },
  };
}

export async function couponReports(range: { from?: string | Date; to?: string | Date } = {}) {
  const where: Prisma.CouponRedemptionWhereInput = {};
  if (range.from || range.to) { const r: Prisma.DateTimeFilter = {}; if (range.from) r.gte = soD(new Date(range.from)); if (range.to) r.lte = eoD(new Date(range.to)); where.createdAt = r; }
  const [byCoupon, coupons, totals] = await Promise.all([
    db.couponRedemption.groupBy({ by: ["couponId"], where, _count: { _all: true }, _sum: { discountPaise: true, orderTotalPaise: true } }),
    db.coupon.findMany({ where: { deletedAt: null }, select: { id: true, code: true, campaignName: true } }),
    db.couponRedemption.aggregate({ where, _count: true, _sum: { discountPaise: true, orderTotalPaise: true } }),
  ]);
  const codeBy = Object.fromEntries(coupons.map((c) => [c.id, c.code]));
  const campBy = Object.fromEntries(coupons.map((c) => [c.id, c.campaignName ?? "—"]));
  const rows = (byCoupon as never as { couponId: string; _count: { _all: number }; _sum: { discountPaise: number | null; orderTotalPaise: number | null } }[])
    .map((r) => ({ couponId: r.couponId, code: codeBy[r.couponId] ?? "—", campaign: campBy[r.couponId] ?? "—", redemptions: r._count._all, discountPaise: r._sum.discountPaise ?? 0, revenuePaise: r._sum.orderTotalPaise ?? 0 }))
    .sort((a, b) => b.redemptions - a.redemptions);
  const byCampaign: Record<string, { redemptions: number; discountPaise: number; revenuePaise: number }> = {};
  rows.forEach((r) => { const c = byCampaign[r.campaign] || { redemptions: 0, discountPaise: 0, revenuePaise: 0 }; c.redemptions += r.redemptions; c.discountPaise += r.discountPaise; c.revenuePaise += r.revenuePaise; byCampaign[r.campaign] = c; });
  return {
    totals: { redemptions: totals._count, discountPaise: totals._sum.discountPaise ?? 0, revenuePaise: totals._sum.orderTotalPaise ?? 0 },
    byCoupon: rows,
    byCampaign: Object.keys(byCampaign).map((k) => ({ campaign: k, ...byCampaign[k] })).sort((a, b) => b.revenuePaise - a.revenuePaise),
  };
}

// ---------------------------------------------------------------- validate + redeem (checkout)
async function resolveCartContext(code: string, cart: CartContext) {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) return { coupon: null as null, ctx: cart };
  let userRedemptions = cart.userRedemptions;
  let isFirstOrder = cart.isFirstOrder;
  if (cart.userId) {
    if (userRedemptions == null) userRedemptions = await db.couponRedemption.count({ where: { couponId: coupon.id, userId: cart.userId } });
    if (isFirstOrder == null) isFirstOrder = (await db.order.count({ where: { userId: cart.userId, status: "PAID" } })) === 0;
  }
  return { coupon, ctx: { ...cart, userRedemptions, isFirstOrder } };
}

/** Real-time validation for checkout / admin preview. */
export async function validateCouponForCart(code: string, cart: CartContext) {
  const { coupon, ctx } = await resolveCartContext(code, cart);
  if (!coupon) return { ok: false, reason: "not_found" as const, discountPaise: 0, message: "Invalid coupon code." };
  return validateCoupon(toRule(coupon), ctx);
}

/** Apply + record a redemption atomically. Idempotent per orderId. */
export async function redeemCoupon(code: string, cart: CartContext, orderId: string | undefined, actor: Actor) {
  return db.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!coupon) throw new Error("Invalid coupon code.");
    if (orderId) {
      const dup = await tx.couponRedemption.findUnique({ where: { orderId } });
      if (dup) return { redeemed: false, idempotent: true, discountPaise: dup.discountPaise };
    }
    let userRedemptions = cart.userRedemptions;
    let isFirstOrder = cart.isFirstOrder;
    if (cart.userId) {
      if (userRedemptions == null) userRedemptions = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId: cart.userId } });
      if (isFirstOrder == null) isFirstOrder = (await tx.order.count({ where: { userId: cart.userId, status: "PAID" } })) === 0;
    }
    const decision = validateCoupon(toRule(coupon), { ...cart, userRedemptions, isFirstOrder });
    if (!decision.ok) throw new Error(decision.message ?? "Coupon not valid.");
    await tx.couponRedemption.create({ data: { couponId: coupon.id, userId: cart.userId ?? null, orderId: orderId ?? null, discountPaise: decision.discountPaise, orderTotalPaise: cart.orderTotalPaise } });
    await tx.coupon.update({ where: { id: coupon.id }, data: { redeemed: { increment: 1 } } });
    return { redeemed: true, discountPaise: decision.discountPaise, couponId: coupon.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type CouponListItem = ReturnType<typeof shape>;
export { dKey };
