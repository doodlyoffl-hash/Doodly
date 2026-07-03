/* =============================================================
   DOODLY System → GST Management — service (Prisma).
   Reuse-first: the backend already computes + snapshots GST
   (lib/billing/service.ts compute(); gstPaise on SubscriptionBilling /
   Invoice / PaymentRecord). This exposes the CONFIG that drives it —
   the global default rate (BillingConfig.gstBps) and per-product
   rates (Pricing.taxBps) — plus GST reports from the real snapshots.
   No new tables. Rates are basis points (bps); 500 bps = 5%.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const pct = (bps: number) => Math.round((bps / 100) * 100) / 100;

const DEFAULT_ID = "default";
async function billingConfig() {
  return db.billingConfig.upsert({ where: { id: DEFAULT_ID }, create: { id: DEFAULT_ID }, update: {} });
}

export async function gstOverview() {
  const [cfg, pricings] = await Promise.all([
    billingConfig(),
    db.pricing.findMany({ include: { product: { select: { slug: true, name: true, deletedAt: true } } } }),
  ]);
  const products = pricings
    .filter((p) => !p.product.deletedAt)
    .map((p) => ({ productId: p.productId, slug: p.product.slug, name: p.product.name, taxBps: p.taxBps, taxPercent: pct(p.taxBps), mrpPaise: p.mrpPaise }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    config: { gstBps: cfg.gstBps, gstPercent: pct(cfg.gstBps), gstin: cfg.gstin, companyName: cfg.companyName, invoicePrefix: cfg.invoicePrefix, updatedAt: cfg.updatedAt },
    products,
  };
}

export async function setGlobalGst(input: { gstBps?: number; gstin?: string | null; companyName?: string }) {
  const data: Record<string, unknown> = {};
  if (input.gstBps != null) { const b = Math.max(0, Math.min(10000, Math.round(input.gstBps))); data.gstBps = b; }
  if (input.gstin !== undefined) data.gstin = input.gstin?.trim() || null;
  if (input.companyName != null && input.companyName.trim()) data.companyName = input.companyName.trim();
  const cfg = await db.billingConfig.upsert({ where: { id: DEFAULT_ID }, create: { id: DEFAULT_ID, ...data }, update: data });
  return { gstBps: cfg.gstBps, gstPercent: pct(cfg.gstBps), gstin: cfg.gstin, companyName: cfg.companyName };
}

export async function setProductGst(idOrSlug: string, taxBps: number) {
  const bps = Math.max(0, Math.min(10000, Math.round(taxBps)));
  const product = await db.product.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: { id: true, slug: true, name: true } });
  if (!product) throw new Error("Product not found.");
  const pricing = await db.pricing.findUnique({ where: { productId: product.id }, select: { id: true } });
  if (!pricing) throw new Error(`No pricing row for ${product.name} — set its price first.`);
  await db.pricing.update({ where: { productId: product.id }, data: { taxBps: bps } });
  return { productId: product.id, slug: product.slug, taxBps: bps, taxPercent: pct(bps) };
}

/** GST reports from the real snapshot ledgers. */
export async function gstReports(f: { from?: string; to?: string } = {}) {
  const range: { gte?: Date; lte?: Date } = {};
  if (f.from) range.gte = soD(new Date(f.from));
  if (f.to) range.lte = eoD(new Date(f.to));
  const dateWhere = (field: string) => (range.gte || range.lte ? { [field]: range } : {});

  const [payAgg, billAgg, invAgg, billByRate] = await Promise.all([
    db.paymentRecord.aggregate({ _sum: { gstPaise: true }, _count: { _all: true }, where: { ...dateWhere("createdAt") } }),
    db.subscriptionBilling.aggregate({ _sum: { gstPaise: true, billingAmountPaise: true }, _count: { _all: true }, where: { ...dateWhere("createdAt") } }),
    db.invoice.aggregate({ _sum: { gstPaise: true }, _count: { _all: true }, where: { ...dateWhere("createdAt") } }),
    db.subscriptionBilling.groupBy({ by: ["gstBps"], _sum: { gstPaise: true, billingAmountPaise: true }, _count: { _all: true }, where: { ...dateWhere("createdAt") } }),
  ]);
  return {
    collected: { gstPaise: payAgg._sum.gstPaise ?? 0, count: payAgg._count._all },
    billed: { gstPaise: billAgg._sum.gstPaise ?? 0, taxablePaise: billAgg._sum.billingAmountPaise ?? 0, count: billAgg._count._all },
    invoiced: { gstPaise: invAgg._sum.gstPaise ?? 0, count: invAgg._count._all },
    byRate: billByRate.map((r) => ({ bps: r.gstBps, percent: pct(r.gstBps), gstPaise: r._sum.gstPaise ?? 0, taxablePaise: r._sum.billingAmountPaise ?? 0, count: r._count._all })).sort((a, b) => a.bps - b.bps),
  };
}
