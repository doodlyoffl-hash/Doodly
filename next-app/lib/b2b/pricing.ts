/* =============================================================
   B2B Pricing — service layer (Prisma, server-only). Per-business
   negotiated product prices with a price-change audit trail, soft
   delete + restore, duplicate prevention and reports.
   Admin / Super-Admin only (enforced at the API layer).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { B2B_PRODUCTS } from "./catalog";

interface Actor { actorId?: string; actorRole?: string }

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; const c = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : ""; if (c === "P2034" || c === "P2037" || c === "P2002") { await sleep(40 * (i + 1)); continue; } throw e; }
  }
  throw last;
}
async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}
const formatPricingCode = (seq: number) => `B2BP-${String(seq).padStart(6, "0")}`;
const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

/** Derive discount + effective (with GST) from base + negotiated B2B price. */
export function derivePricing(basePaise: number, b2bPaise: number, gstBps: number) {
  const discountBps = basePaise > 0 ? Math.round(((basePaise - b2bPaise) / basePaise) * 10000) : 0;
  return { discountBps, effectivePaise: b2bPaise, effectiveWithGstPaise: Math.round(b2bPaise * (1 + gstBps / 10000)) };
}

const PricingBase = z.object({
  businessId: z.string().min(1, "Select a business"),
  productSlug: z.string().min(1, "Select a product"),
  productName: z.string().min(1),
  variantLabel: z.string().trim().max(40).optional().or(z.literal("")),
  unit: z.string().min(1, "Select a unit"),
  basePricePaise: z.coerce.number().int().positive("Base price must be greater than zero"),
  b2bPricePaise: z.coerce.number().int().positive("B2B price must be greater than zero"),
  gstBps: z.coerce.number().int().min(0, "GST cannot be negative").max(10000, "GST cannot exceed 100%").default(0),
  minQty: z.coerce.number().int().min(1).default(1),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().nullable().optional(),
});
export const PricingSchema = PricingBase.refine((d) => d.b2bPricePaise <= d.basePricePaise, { message: "B2B price cannot exceed the base price (discount would be negative)", path: ["b2bPricePaise"] });

function shape(p: Prisma.BusinessPricingGetPayload<{ include: { business: { select: { code: true; name: true; active: true } } } }>) {
  const d = derivePricing(p.basePricePaise, p.b2bPricePaise, p.gstBps);
  return {
    id: p.id, code: p.code, businessId: p.businessId,
    businessCode: p.business.code, businessName: p.business.name, businessActive: p.business.active,
    productSlug: p.productSlug, productName: p.productName, variantLabel: p.variantLabel, unit: p.unit, minQty: p.minQty,
    basePricePaise: p.basePricePaise, b2bPricePaise: p.b2bPricePaise, gstBps: p.gstBps,
    discountBps: d.discountBps, effectivePaise: d.effectivePaise, effectiveWithGstPaise: d.effectiveWithGstPaise,
    effectiveFrom: p.effectiveFrom.toISOString(), effectiveUntil: p.effectiveUntil?.toISOString() ?? null,
    active: p.active, deleted: !!p.deletedAt, updatedAt: p.updatedAt.toISOString(), updatedById: p.updatedById ?? p.createdById ?? null,
  };
}

// ---------- list ----------

export type PricingSort = "business" | "product" | "updated" | "price_desc" | "price_asc";
export async function listPricing(args: {
  businessId?: string; productSlug?: string; active?: boolean; q?: string;
  priceFromPaise?: number; priceToPaise?: number; includeDeleted?: boolean;
  sort?: PricingSort; limit?: number; offset?: number;
} = {}) {
  const where: Prisma.BusinessPricingWhereInput = {};
  if (!args.includeDeleted) where.deletedAt = null;
  if (args.businessId) where.businessId = args.businessId;
  if (args.productSlug) where.productSlug = args.productSlug;
  if (args.active !== undefined) where.active = args.active;
  if (args.priceFromPaise != null || args.priceToPaise != null) where.b2bPricePaise = { ...(args.priceFromPaise != null ? { gte: args.priceFromPaise } : {}), ...(args.priceToPaise != null ? { lte: args.priceToPaise } : {}) };
  if (args.q?.trim()) {
    const s = args.q.trim();
    where.OR = [
      { code: { contains: s, mode: "insensitive" } },
      { productName: { contains: s, mode: "insensitive" } },
      { business: { code: { contains: s, mode: "insensitive" } } },
      { business: { name: { contains: s, mode: "insensitive" } } },
    ];
  }
  const orderBy: Prisma.BusinessPricingOrderByWithRelationInput =
    args.sort === "business" ? { business: { name: "asc" } }
    : args.sort === "product" ? { productName: "asc" }
    : args.sort === "price_desc" ? { b2bPricePaise: "desc" }
    : args.sort === "price_asc" ? { b2bPricePaise: "asc" }
    : { updatedAt: "desc" };
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const offset = Math.max(args.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    db.businessPricing.findMany({ where, orderBy, take: limit, skip: offset, include: { business: { select: { code: true, name: true, active: true } } } }),
    db.businessPricing.count({ where }),
  ]);
  return { pricing: rows.map(shape), total, limit, offset };
}

export async function getPricing(id: string) {
  const p = await db.businessPricing.findUnique({ where: { id }, include: { business: { select: { code: true, name: true, active: true } }, history: { orderBy: { createdAt: "desc" }, take: 50 } } });
  if (!p) return null;
  const { history, ...rest } = p;
  return { ...shape(rest), history: history.map((h) => ({ id: h.id, action: h.action, oldB2bPaise: h.oldB2bPaise, newB2bPaise: h.newB2bPaise, oldGstBps: h.oldGstBps, newGstBps: h.newGstBps, reason: h.reason, byRole: h.byRole, createdAt: h.createdAt.toISOString() })) };
}

// ---------- mutations ----------

export async function createPricing(raw: unknown, actor: Actor) {
  const data = PricingSchema.parse(raw);
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const biz = await tx.business.findUnique({ where: { id: data.businessId }, select: { id: true, active: true, deletedAt: true } });
      if (!biz || biz.deletedAt) throw new Error("Business not found");
      if (!biz.active) throw new Error("Cannot add pricing for an inactive business");
      // duplicate prevention: one active rule per business + product + variant + qty slab
      const dup = await tx.businessPricing.findFirst({ where: { businessId: data.businessId, productSlug: data.productSlug, variantLabel: clean(data.variantLabel) ?? null, minQty: data.minQty, deletedAt: null }, select: { code: true } });
      if (dup) throw new Error(`A pricing rule already exists for this business/product/quantity (${dup.code}). Edit it instead.`);

      const code = formatPricingCode(await nextSeq(tx, "b2bpricing"));
      const created = await tx.businessPricing.create({
        data: {
          code, businessId: data.businessId, productSlug: data.productSlug, productName: data.productName, variantLabel: clean(data.variantLabel),
          unit: data.unit, basePricePaise: data.basePricePaise, b2bPricePaise: data.b2bPricePaise, gstBps: data.gstBps, minQty: data.minQty,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(), effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null,
          createdById: actor.actorId, updatedById: actor.actorId,
        },
      });
      await tx.businessPricingHistory.create({ data: { pricingId: created.id, action: "created", oldB2bPaise: null, newB2bPaise: data.b2bPricePaise, oldGstBps: null, newGstBps: data.gstBps, byId: actor.actorId, byRole: actor.actorRole } });
      return created;
    }, TX),
  );
}

const UpdateSchema = PricingBase.partial().extend({ reason: z.string().trim().max(200).optional() });
export async function updatePricing(id: string, raw: unknown, actor: Actor) {
  const data = UpdateSchema.parse(raw);
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const cur = await tx.businessPricing.findUnique({ where: { id }, select: { b2bPricePaise: true, basePricePaise: true, gstBps: true } });
      if (!cur) throw new Error("Pricing not found");
      const newBase = data.basePricePaise ?? cur.basePricePaise;
      const newB2b = data.b2bPricePaise ?? cur.b2bPricePaise;
      if (newB2b > newBase) throw new Error("B2B price cannot exceed the base price.");
      const newGst = data.gstBps ?? cur.gstBps;
      const updated = await tx.businessPricing.update({
        where: { id },
        data: {
          ...(data.basePricePaise !== undefined ? { basePricePaise: data.basePricePaise } : {}),
          ...(data.b2bPricePaise !== undefined ? { b2bPricePaise: data.b2bPricePaise } : {}),
          ...(data.gstBps !== undefined ? { gstBps: data.gstBps } : {}),
          ...(data.unit !== undefined ? { unit: data.unit } : {}),
          ...(data.variantLabel !== undefined ? { variantLabel: clean(data.variantLabel) } : {}),
          ...(data.minQty !== undefined ? { minQty: data.minQty } : {}),
          ...(data.effectiveFrom !== undefined ? { effectiveFrom: new Date(data.effectiveFrom!) } : {}),
          ...(data.effectiveUntil !== undefined ? { effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null } : {}),
          updatedById: actor.actorId,
        },
      });
      if (newB2b !== cur.b2bPricePaise || newGst !== cur.gstBps) {
        await tx.businessPricingHistory.create({ data: { pricingId: id, action: "updated", oldB2bPaise: cur.b2bPricePaise, newB2bPaise: newB2b, oldGstBps: cur.gstBps, newGstBps: newGst, reason: clean(data.reason), byId: actor.actorId, byRole: actor.actorRole } });
      }
      return updated;
    }, TX),
  );
}

export async function setPricingActive(id: string, active: boolean) {
  return db.businessPricing.update({ where: { id }, data: { active } });
}

export async function softDeletePricing(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const cur = await tx.businessPricing.findUnique({ where: { id }, select: { b2bPricePaise: true, gstBps: true } });
    if (!cur) throw new Error("Pricing not found");
    const p = await tx.businessPricing.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await tx.businessPricingHistory.create({ data: { pricingId: id, action: "deleted", oldB2bPaise: cur.b2bPricePaise, newB2bPaise: cur.b2bPricePaise, oldGstBps: cur.gstBps, newGstBps: cur.gstBps, byId: actor.actorId, byRole: actor.actorRole } });
    return p;
  }, TX);
}

export async function restorePricing(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const cur = await tx.businessPricing.findUnique({ where: { id }, select: { b2bPricePaise: true, gstBps: true } });
    if (!cur) throw new Error("Pricing not found");
    const p = await tx.businessPricing.update({ where: { id }, data: { deletedAt: null, active: true } });
    await tx.businessPricingHistory.create({ data: { pricingId: id, action: "restored", oldB2bPaise: cur.b2bPricePaise, newB2bPaise: cur.b2bPricePaise, oldGstBps: cur.gstBps, newGstBps: cur.gstBps, byId: actor.actorId, byRole: actor.actorRole } });
    return p;
  }, TX);
}

// ---------- lookups + reports ----------

export function productLookup() {
  return B2B_PRODUCTS.map((p) => ({ slug: p.slug, name: p.name, units: p.units, primaryUnit: p.primaryUnit, basePricePaise: p.defaultPricePaise }));
}

export async function pricingReports() {
  const where: Prisma.BusinessPricingWhereInput = { deletedAt: null };
  const [all, byBusiness, byProduct, businessesWithPricing] = await Promise.all([
    db.businessPricing.findMany({ where, select: { basePricePaise: true, b2bPricePaise: true, active: true } }),
    db.businessPricing.groupBy({ by: ["businessId"], where, _count: true, _avg: { b2bPricePaise: true } }),
    db.businessPricing.groupBy({ by: ["productName"], where, _count: true, _avg: { b2bPricePaise: true, basePricePaise: true } }),
    db.businessPricing.findMany({ where, distinct: ["businessId"], select: { businessId: true } }),
  ]);
  const avgDiscountBps = all.length ? Math.round(all.reduce((s, p) => s + (p.basePricePaise > 0 ? ((p.basePricePaise - p.b2bPricePaise) / p.basePricePaise) * 10000 : 0), 0) / all.length) : 0;
  const bizIds = byBusiness.map((b) => b.businessId);
  const names = bizIds.length ? await db.business.findMany({ where: { id: { in: bizIds } }, select: { id: true, code: true, name: true } }) : [];
  const nameById = new Map(names.map((n) => [n.id, n]));
  return {
    totalRules: all.length,
    activeRules: all.filter((p) => p.active).length,
    businessesCovered: businessesWithPricing.length,
    avgDiscountBps,
    byBusiness: byBusiness.map((b) => ({ code: nameById.get(b.businessId)?.code, name: nameById.get(b.businessId)?.name, rules: b._count, avgB2bPaise: Math.round(b._avg.b2bPricePaise ?? 0) })).sort((a, b) => b.rules - a.rules).slice(0, 10),
    byProduct: byProduct.map((p) => ({ name: p.productName, rules: p._count, avgB2bPaise: Math.round(p._avg.b2bPricePaise ?? 0), avgBasePaise: Math.round(p._avg.basePricePaise ?? 0) })).sort((a, b) => b.rules - a.rules),
  };
}
