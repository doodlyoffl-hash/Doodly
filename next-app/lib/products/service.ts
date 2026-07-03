/* =============================================================
   DOODLY — Products (PIM) service layer
   The single source of truth behind /api/admin/products/*.
   The public storefront keeps using /api/products; this is the
   admin/ERP surface. Every mutation appends a ProductEvent.
   The catalogue is small, so list/filter/sort/paginate run in
   memory after one query (correct for derived stock states).
   ============================================================= */
import "server-only";
import { Prisma, type ProductStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import type {
  ProductListResponse, ProductListItem, ProductStats, ProductDetail, ProductReports, VariantRow,
} from "./types";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

type Tx = Prisma.TransactionClient;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export async function logProductEvent(client: Tx | typeof db, productId: string, type: string, summary: string, detail: unknown, actor: Actor) {
  await client.productEvent.create({
    data: { productId, type, summary, detail: detail === undefined ? Prisma.JsonNull : (detail as Prisma.InputJsonValue), byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip },
  });
}

const listInclude = {
  variants: { orderBy: { ml: "asc" as const } },
  pricing: true,
  categoryRef: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

type Loaded = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

function stockOf(p: Loaded) {
  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
  const reserved = p.variants.reduce((s, v) => s + v.reservedStock, 0);
  const available = stock - reserved;
  const lowStock = p.variants.some((v) => v.stock > 0 && v.stock <= v.lowStockThreshold) || (stock > 0 && stock <= p.lowStockThreshold);
  const outOfStock = p.status === "OUT_OF_STOCK" || (p.variants.length > 0 && stock <= 0);
  return { stock, reserved, available, lowStock, outOfStock };
}

async function updatedByNames(ids: (string | null)[]) {
  const set = [...new Set(ids.filter(Boolean) as string[])];
  if (!set.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: set } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id.slice(-6)]));
}

// ---------------------------------------------------------------- stats

export async function productStats(): Promise<ProductStats> {
  const products = await db.product.findMany({ where: { deletedAt: null }, include: listInclude });
  let active = 0, inactive = 0, draft = 0, comingSoon = 0, featured = 0, outOfStock = 0, lowStock = 0, stockValue = 0;
  for (const p of products) {
    if (p.status === "AVAILABLE") active++;
    if (p.status === "HIDDEN" || p.status === "DISCONTINUED") inactive++;
    if (p.status === "DRAFT") draft++;
    if (p.status === "COMING_SOON") comingSoon++;
    if (p.featured) featured++;
    const s = stockOf(p);
    if (s.outOfStock) outOfStock++;
    if (s.lowStock) lowStock++;
    stockValue += (p.pricing?.sellingPaise ?? 0) * s.stock;
  }
  return { total: products.length, active, inactive, draft, comingSoon, featured, outOfStock, lowStock, totalStockValuePaise: stockValue };
}

// ---------------------------------------------------------------- list

export interface ListArgs {
  status?: string; visible?: string; featured?: string; stockState?: string; categoryId?: string; variantType?: string;
  dateFrom?: string; dateTo?: string; q?: string; sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number;
}

export async function listProducts(args: ListArgs): Promise<ProductListResponse> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, args.pageSize ?? 20));

  let products = await db.product.findMany({ where: { deletedAt: null }, include: listInclude });

  // ---- filters (in memory; small catalogue) ----
  if (args.status) products = products.filter((p) => p.status === args.status);
  if (args.visible === "1") products = products.filter((p) => p.visible);
  if (args.visible === "0") products = products.filter((p) => !p.visible);
  if (args.featured === "1") products = products.filter((p) => p.featured);
  if (args.categoryId) products = products.filter((p) => p.categoryId === args.categoryId);
  if (args.variantType) products = products.filter((p) => p.variants.some((v) => v.type === args.variantType));
  if (args.stockState) products = products.filter((p) => { const s = stockOf(p); return args.stockState === "out" ? s.outOfStock : args.stockState === "low" ? s.lowStock && !s.outOfStock : s.stock > 0 && !s.lowStock; });
  if (args.dateFrom || args.dateTo) {
    const from = args.dateFrom ? startOfDay(new Date(args.dateFrom)).getTime() : 0;
    const to = args.dateTo ? addDays(startOfDay(new Date(args.dateTo)), 1).getTime() : Infinity;
    products = products.filter((p) => p.createdAt.getTime() >= from && p.createdAt.getTime() <= to);
  }
  if (args.q?.trim()) {
    const q = args.q.trim().toLowerCase();
    products = products.filter((p) =>
      p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) ||
      (p.categoryRef?.name ?? p.category ?? "").toLowerCase().includes(q) ||
      p.variants.some((v) => (v.sku ?? "").toLowerCase().includes(q) || v.label.toLowerCase().includes(q)));
  }

  // ---- sort ----
  const dir = args.dir ?? (args.sort === "name" ? "asc" : "desc");
  const mul = dir === "asc" ? 1 : -1;
  const priceOf = (p: Loaded) => p.pricing?.sellingPaise ?? 0;
  products.sort((a, b) => {
    switch (args.sort) {
      case "name": return a.name.localeCompare(b.name) * mul;
      case "updated": return (a.updatedAt.getTime() - b.updatedAt.getTime()) * mul;
      case "price": return (priceOf(a) - priceOf(b)) * mul;
      case "stock": return (stockOf(a).stock - stockOf(b).stock) * mul;
      default: return (a.createdAt.getTime() - b.createdAt.getTime()) * mul; // created
    }
  });

  const total = products.length;
  const pageRows = products.slice((page - 1) * pageSize, page * pageSize);
  const names = await updatedByNames(pageRows.map((p) => p.updatedById));
  const categories = await db.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

  const items: ProductListItem[] = pageRows.map((p) => {
    const s = stockOf(p);
    const v0 = p.variants[0];
    return {
      id: p.id, slug: p.slug, name: p.name, imageUrl: p.imageUrl, category: p.categoryRef?.name ?? p.category, status: p.status,
      visible: p.visible, featured: p.featured, variantCount: p.variants.length, sku: v0?.sku ?? null,
      mrpPaise: p.pricing?.mrpPaise ?? null, sellingPaise: p.pricing?.sellingPaise ?? null,
      discountBps: p.pricing?.discountBps ?? 0, taxBps: p.pricing?.taxBps ?? 0,
      stock: s.stock, reservedStock: s.reserved, availableStock: s.available, lowStockThreshold: p.lowStockThreshold,
      lowStock: s.lowStock, outOfStock: s.outOfStock,
      createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
      updatedBy: p.updatedById ? names.get(p.updatedById) ?? null : null,
    };
  });
  return { products: items, total, page, pageSize, facets: { categories } };
}

// ---------------------------------------------------------------- detail

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const p = await db.product.findUnique({
    where: { id },
    include: { variants: { orderBy: { ml: "asc" } }, pricing: true, images: { orderBy: { sortOrder: "asc" } }, seo: true, nutrition: true, quality: true, categoryRef: { select: { id: true, name: true } }, events: { orderBy: { createdAt: "desc" }, take: 40 } },
  });
  if (!p) return null;
  const names = await updatedByNames([p.updatedById]);
  const stock = p.variants.reduce((s, v) => s + v.stock, 0);
  const reserved = p.variants.reduce((s, v) => s + v.reservedStock, 0);

  const variants: VariantRow[] = p.variants.map((v) => ({
    id: v.id, label: v.label, displayName: v.displayName, sku: v.sku, ml: v.ml, type: v.type, dailyPaise: v.dailyPaise, fixedPaise: v.fixedPaise, fixedDays: v.fixedDays,
    stock: v.stock, reservedStock: v.reservedStock, availableStock: v.stock - v.reservedStock, lowStockThreshold: v.lowStockThreshold, weightG: v.weightG, barcode: v.barcode, active: v.active,
  }));

  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, longDesc: p.longDesc, story: p.story, usage: p.usage, storage: p.storage, ingredients: p.ingredients, allergens: p.allergens,
    status: p.status, visible: p.visible, featured: p.featured, category: p.categoryRef?.name ?? p.category, categoryId: p.categoryId, imageUrl: p.imageUrl, sortOrder: p.sortOrder, tags: p.tags,
    lowStockThreshold: p.lowStockThreshold, restockDate: p.restockDate?.toISOString() ?? null, launchDate: p.launchDate?.toISOString() ?? null, ratingValue: p.ratingValue, ratingCount: p.ratingCount,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), updatedBy: p.updatedById ? names.get(p.updatedById) ?? null : null, deletedAt: p.deletedAt?.toISOString() ?? null,
    pricing: p.pricing ? { mrpPaise: p.pricing.mrpPaise, sellingPaise: p.pricing.sellingPaise, costPaise: p.pricing.costPaise, offerPaise: p.pricing.offerPaise, discountBps: p.pricing.discountBps, taxBps: p.pricing.taxBps, depositPaise: p.pricing.depositPaise, deliveryPaise: p.pricing.deliveryPaise } : null,
    variants,
    images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, sortOrder: i.sortOrder, isFeatured: i.isFeatured })),
    seo: p.seo ? { metaTitle: p.seo.metaTitle, metaDescription: p.seo.metaDescription, ogImageUrl: p.seo.ogImageUrl, canonicalUrl: p.seo.canonicalUrl, keywords: p.seo.keywords } : null,
    nutrition: p.nutrition ? { fat: p.nutrition.fat, snf: p.nutrition.snf, protein: p.nutrition.protein, calcium: p.nutrition.calcium, energy: p.nutrition.energy, carbs: p.nutrition.carbs, sugar: p.nutrition.sugar } : null,
    quality: p.quality ? { fatPct: p.quality.fatPct, snf: p.quality.snf, lactometer: p.quality.lactometer, storageTemp: p.quality.storageTemp, milkType: p.quality.milkType, animalType: p.quality.animalType, expiry: p.quality.expiry } : null,
    inventory: { stock, reserved, available: stock - reserved, lowStock: variants.some((v) => v.stock > 0 && v.stock <= v.lowStockThreshold), outOfStock: p.status === "OUT_OF_STOCK" || (variants.length > 0 && stock <= 0) },
    events: p.events.map((e) => ({ id: e.id, type: e.type, summary: e.summary, detail: e.detail, byRole: e.byRole, createdAt: e.createdAt.toISOString() })),
  };
}

// ---------------------------------------------------------------- create / update

const STATUSES: ProductStatus[] = ["AVAILABLE", "DRAFT", "COMING_SOON", "OUT_OF_STOCK", "DISCONTINUED", "HIDDEN", "ARCHIVED"];

export interface CreateArgs {
  slug: string; name: string; description: string; categoryId?: string; status?: string; visible?: boolean; featured?: boolean;
  imageUrl?: string; tags?: string[];
  pricing?: { mrpPaise: number; sellingPaise: number; discountBps?: number; taxBps?: number; depositPaise?: number };
  variants?: { label: string; ml: number; type?: "TRIAL" | "SUBSCRIPTION"; sku?: string; dailyPaise?: number; fixedPaise?: number; fixedDays?: number; stock?: number; weightG?: number }[];
}

export async function createProduct(args: CreateArgs, actor: Actor) {
  if (await db.product.findUnique({ where: { slug: args.slug }, select: { id: true } })) throw Errors.conflict("A product with that slug already exists.");
  if (await db.product.findFirst({ where: { name: { equals: args.name, mode: "insensitive" }, deletedAt: null }, select: { id: true } })) throw Errors.conflict("A product with that name already exists.");
  if (args.categoryId && !(await db.category.findUnique({ where: { id: args.categoryId }, select: { id: true } }))) throw Errors.badRequest("That category does not exist.");

  const created = await db.product.create({
    data: {
      slug: args.slug, name: args.name, description: args.description, categoryId: args.categoryId ?? null,
      status: (args.status as ProductStatus) ?? "COMING_SOON", visible: args.visible ?? true, featured: args.featured ?? false,
      imageUrl: args.imageUrl ?? null, tags: args.tags ?? [], updatedById: actor.actorId,
      ...(args.pricing ? { pricing: { create: { mrpPaise: args.pricing.mrpPaise, sellingPaise: args.pricing.sellingPaise, discountBps: args.pricing.discountBps ?? 0, taxBps: args.pricing.taxBps ?? 0, depositPaise: args.pricing.depositPaise ?? 0 } } } : {}),
      ...(args.variants?.length ? { variants: { create: args.variants.map((v) => ({ label: v.label, ml: v.ml, type: v.type ?? "SUBSCRIPTION", sku: v.sku, dailyPaise: v.dailyPaise, fixedPaise: v.fixedPaise, fixedDays: v.fixedDays, stock: v.stock ?? 0, weightG: v.weightG })) } } : {}),
    },
    select: { id: true },
  });
  await logProductEvent(db, created.id, "CREATED", `Product "${args.name}" created`, { slug: args.slug, status: args.status }, actor);
  return { id: created.id };
}

export interface UpdateArgs {
  name?: string; description?: string; longDesc?: string; story?: string; usage?: string; storage?: string; ingredients?: string; allergens?: string;
  categoryId?: string | null; visible?: boolean; imageUrl?: string | null; sortOrder?: number; tags?: string[]; lowStockThreshold?: number;
}

export async function updateProduct(id: string, args: UpdateArgs, actor: Actor) {
  const cur = await db.product.findUnique({ where: { id }, select: { id: true, name: true, categoryId: true } });
  if (!cur) throw Errors.notFound("Product not found.");
  if (args.categoryId && !(await db.category.findUnique({ where: { id: args.categoryId }, select: { id: true } }))) throw Errors.badRequest("That category does not exist.");
  const data: Prisma.ProductUpdateInput = { updatedById: actor.actorId };
  const changed: string[] = [];
  for (const k of ["name", "description", "longDesc", "story", "usage", "storage", "ingredients", "allergens", "visible", "imageUrl", "sortOrder", "tags", "lowStockThreshold"] as const) {
    if (args[k] !== undefined) { (data as Record<string, unknown>)[k] = args[k]; changed.push(k); }
  }
  if (args.categoryId !== undefined) { data.categoryRef = args.categoryId ? { connect: { id: args.categoryId } } : { disconnect: true }; changed.push("category"); }
  await db.product.update({ where: { id }, data });
  await logProductEvent(db, id, "UPDATED", `Product edited (${changed.join(", ") || "no changes"})`, { changed }, actor);
  return { id, changed };
}

export async function setStatus(id: string, status: string, actor: Actor) {
  if (!STATUSES.includes(status as ProductStatus)) throw Errors.badRequest("Invalid status.");
  const cur = await db.product.findUnique({ where: { id }, select: { status: true } });
  if (!cur) throw Errors.notFound("Product not found.");
  await db.product.update({ where: { id }, data: { status: status as ProductStatus, updatedById: actor.actorId, ...(status === "AVAILABLE" ? { visible: true } : {}) } });
  await logProductEvent(db, id, "STATUS", `Status ${cur.status} → ${status}`, { from: cur.status, to: status }, actor);
  return { id, status };
}

export async function setFeatured(id: string, featured: boolean, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  await db.product.update({ where: { id }, data: { featured, updatedById: actor.actorId } });
  await logProductEvent(db, id, "FEATURE", featured ? "Marked featured" : "Unmarked featured", { featured }, actor);
  return { id, featured };
}

export async function softDeleteProduct(id: string, actor: Actor) {
  const cur = await db.product.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!cur) throw Errors.notFound("Product not found.");
  if (cur.deletedAt) throw Errors.conflict("Product already deleted.");
  await db.product.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", visible: false, updatedById: actor.actorId } });
  await logProductEvent(db, id, "DELETED", "Product soft-deleted (archived)", undefined, actor);
  return { id };
}

export async function restoreProduct(id: string, actor: Actor) {
  await db.product.update({ where: { id }, data: { deletedAt: null, status: "DRAFT", updatedById: actor.actorId } });
  await logProductEvent(db, id, "RESTORED", "Product restored", undefined, actor);
  return { id };
}

// ---------------------------------------------------------------- pricing / seo / nutrition / quality

export async function updatePricing(id: string, p: { mrpPaise?: number; sellingPaise?: number; costPaise?: number; offerPaise?: number; discountBps?: number; taxBps?: number; depositPaise?: number; deliveryPaise?: number }, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  const create = { mrpPaise: p.mrpPaise ?? 0, sellingPaise: p.sellingPaise ?? 0, costPaise: p.costPaise, offerPaise: p.offerPaise, discountBps: p.discountBps ?? 0, taxBps: p.taxBps ?? 0, depositPaise: p.depositPaise ?? 0, deliveryPaise: p.deliveryPaise ?? 0 };
  await db.pricing.upsert({ where: { productId: id }, create: { productId: id, ...create }, update: p });
  await db.product.update({ where: { id }, data: { updatedById: actor.actorId } });
  await logProductEvent(db, id, "PRICE", "Pricing updated", p, actor);
  return { id };
}

export async function updateSeo(id: string, s: { metaTitle?: string; metaDescription?: string; ogImageUrl?: string; canonicalUrl?: string; keywords?: string[] }, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  await db.seoMetadata.upsert({ where: { productId: id }, create: { productId: id, ...s }, update: s });
  await db.product.update({ where: { id }, data: { updatedById: actor.actorId } });
  await logProductEvent(db, id, "SEO", "SEO metadata updated", undefined, actor);
  return { id };
}

export async function updateNutrition(id: string, n: Record<string, string>, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  await db.nutritionalInformation.upsert({ where: { productId: id }, create: { productId: id, ...n }, update: n });
  await db.product.update({ where: { id }, data: { updatedById: actor.actorId } });
  await logProductEvent(db, id, "UPDATED", "Nutrition updated", undefined, actor);
  return { id };
}

export async function updateQuality(id: string, qd: Record<string, string>, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  await db.qualityParameters.upsert({ where: { productId: id }, create: { productId: id, ...qd }, update: qd });
  await db.product.update({ where: { id }, data: { updatedById: actor.actorId } });
  await logProductEvent(db, id, "UPDATED", "Quality parameters updated", undefined, actor);
  return { id };
}

// ---------------------------------------------------------------- variants

export interface VariantArgs { label?: string; displayName?: string; sku?: string; ml?: number; type?: "TRIAL" | "SUBSCRIPTION"; dailyPaise?: number; fixedPaise?: number; fixedDays?: number; stock?: number; reservedStock?: number; lowStockThreshold?: number; weightG?: number; barcode?: string; active?: boolean }

export async function addVariant(productId: string, a: VariantArgs, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id: productId }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  if (!a.label || a.ml == null) throw Errors.badRequest("Variant label and ml are required.");
  if (a.sku && (await db.variant.findUnique({ where: { sku: a.sku }, select: { id: true } }))) throw Errors.conflict("That SKU is already in use.");
  const v = await db.variant.create({ data: { productId, label: a.label, displayName: a.displayName, sku: a.sku, ml: a.ml, type: a.type ?? "SUBSCRIPTION", dailyPaise: a.dailyPaise, fixedPaise: a.fixedPaise, fixedDays: a.fixedDays, stock: a.stock ?? 0, lowStockThreshold: a.lowStockThreshold ?? 20, weightG: a.weightG, barcode: a.barcode, active: a.active ?? true } });
  await logProductEvent(db, productId, "VARIANT", `Variant "${a.label}" added`, { variantId: v.id }, actor);
  return { id: v.id };
}

export async function updateVariant(productId: string, variantId: string, a: VariantArgs, actor: Actor) {
  const v = await db.variant.findFirst({ where: { id: variantId, productId }, select: { id: true, stock: true, sku: true } });
  if (!v) throw Errors.notFound("Variant not found.");
  if (a.sku && a.sku !== v.sku && (await db.variant.findUnique({ where: { sku: a.sku }, select: { id: true } }))) throw Errors.conflict("That SKU is already in use.");
  await db.variant.update({ where: { id: variantId }, data: a });
  await db.product.update({ where: { id: productId }, data: { updatedById: actor.actorId } });
  const type = a.stock !== undefined && a.stock !== v.stock ? "STOCK" : "VARIANT";
  await logProductEvent(db, productId, type, type === "STOCK" ? `Variant stock ${v.stock} → ${a.stock}` : `Variant "${variantId.slice(-6)}" updated`, a, actor);
  return { id: variantId };
}

export async function deleteVariant(productId: string, variantId: string, actor: Actor) {
  const v = await db.variant.findFirst({ where: { id: variantId, productId }, select: { id: true, subItems: { take: 1, select: { id: true } } } });
  if (!v) throw Errors.notFound("Variant not found.");
  if (v.subItems.length) throw Errors.conflict("This variant is used by subscriptions and cannot be deleted; deactivate it instead.");
  await db.variant.delete({ where: { id: variantId } });
  await logProductEvent(db, productId, "VARIANT", "Variant deleted", { variantId }, actor);
  return { id: variantId };
}

// ---------------------------------------------------------------- images (by URL — binary upload needs a storage provider)

export async function addImage(productId: string, url: string, alt: string | undefined, actor: Actor) {
  if (!(await db.product.findUnique({ where: { id: productId }, select: { id: true } }))) throw Errors.notFound("Product not found.");
  const count = await db.productImage.count({ where: { productId } });
  const img = await db.productImage.create({ data: { productId, url, alt, sortOrder: count, isFeatured: count === 0 } });
  if (count === 0) await db.product.update({ where: { id: productId }, data: { imageUrl: url, updatedById: actor.actorId } });
  await logProductEvent(db, productId, "IMAGE", "Image added", { imageId: img.id }, actor);
  return { id: img.id };
}

export async function deleteImage(productId: string, imageId: string, actor: Actor) {
  const img = await db.productImage.findFirst({ where: { id: imageId, productId }, select: { id: true, isFeatured: true } });
  if (!img) throw Errors.notFound("Image not found.");
  await db.productImage.delete({ where: { id: imageId } });
  if (img.isFeatured) { const next = await db.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: "asc" } }); await db.product.update({ where: { id: productId }, data: { imageUrl: next?.url ?? null } }); if (next) await db.productImage.update({ where: { id: next.id }, data: { isFeatured: true } }); }
  await logProductEvent(db, productId, "IMAGE", "Image deleted", { imageId }, actor);
  return { id: imageId };
}

export async function reorderImages(productId: string, orderedIds: string[], actor: Actor) {
  await db.$transaction(orderedIds.map((id, i) => db.productImage.updateMany({ where: { id, productId }, data: { sortOrder: i } })));
  await logProductEvent(db, productId, "IMAGE", "Images reordered", undefined, actor);
  return { id: productId };
}

export async function setFeaturedImage(productId: string, imageId: string, actor: Actor) {
  const img = await db.productImage.findFirst({ where: { id: imageId, productId }, select: { url: true } });
  if (!img) throw Errors.notFound("Image not found.");
  await db.$transaction([
    db.productImage.updateMany({ where: { productId }, data: { isFeatured: false } }),
    db.productImage.update({ where: { id: imageId }, data: { isFeatured: true } }),
    db.product.update({ where: { id: productId }, data: { imageUrl: img.url, updatedById: actor.actorId } }),
  ]);
  await logProductEvent(db, productId, "IMAGE", "Featured image set", { imageId }, actor);
  return { id: imageId };
}

// ---------------------------------------------------------------- bulk + import

export interface BulkArgs { ids: string[]; action: string; categoryId?: string; discountBps?: number; sellingPaise?: number; stock?: number; stockDelta?: number }

export async function bulkProducts(args: BulkArgs, actor: Actor) {
  const ids = [...new Set(args.ids)].slice(0, 500);
  const valid = await db.product.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
  const validIds = valid.map((v) => v.id);
  if (!validIds.length) throw Errors.badRequest("No valid products selected.");
  const stamp = (type: string, summary: string) => db.productEvent.createMany({ data: validIds.map((productId) => ({ productId, type, summary, byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });

  switch (args.action) {
    case "activate": await db.product.updateMany({ where: { id: { in: validIds } }, data: { status: "AVAILABLE", visible: true, updatedById: actor.actorId } }); await stamp("STATUS", "Activated (bulk)"); break;
    case "deactivate": await db.product.updateMany({ where: { id: { in: validIds } }, data: { status: "HIDDEN", visible: false, updatedById: actor.actorId } }); await stamp("STATUS", "Deactivated (bulk)"); break;
    case "delete": await db.product.updateMany({ where: { id: { in: validIds } }, data: { deletedAt: new Date(), status: "ARCHIVED", visible: false, updatedById: actor.actorId } }); await stamp("DELETED", "Soft-deleted (bulk)"); break;
    case "category":
      if (!args.categoryId) throw Errors.badRequest("Pick a category.");
      if (!(await db.category.findUnique({ where: { id: args.categoryId }, select: { id: true } }))) throw Errors.badRequest("That category does not exist.");
      await db.product.updateMany({ where: { id: { in: validIds } }, data: { categoryId: args.categoryId, updatedById: actor.actorId } }); await stamp("UPDATED", "Category changed (bulk)"); break;
    case "price":
      if (args.discountBps == null && args.sellingPaise == null) throw Errors.badRequest("Provide a discount or selling price.");
      for (const id of validIds) await db.pricing.updateMany({ where: { productId: id }, data: { ...(args.discountBps != null ? { discountBps: args.discountBps } : {}), ...(args.sellingPaise != null ? { sellingPaise: args.sellingPaise } : {}) } });
      await stamp("PRICE", "Price updated (bulk)"); break;
    case "stock":
      for (const id of validIds) {
        if (args.stock != null) await db.variant.updateMany({ where: { productId: id }, data: { stock: args.stock } });
        else if (args.stockDelta != null) await db.variant.updateMany({ where: { productId: id }, data: { stock: { increment: args.stockDelta } } });
      }
      await stamp("STOCK", "Stock updated (bulk)"); break;
    case "export": await stamp("NOTE", "Exported (bulk)"); break;
    default: throw Errors.badRequest("Unknown bulk action.");
  }
  return { count: validIds.length, action: args.action };
}

export interface ImportRow { slug: string; name: string; description?: string; categorySlug?: string; status?: string; mrpPaise?: number; sellingPaise?: number; taxBps?: number }

export async function importProducts(rows: ImportRow[], actor: Actor) {
  let created = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(0, 500)) {
    if (!r.slug || !r.name) { skipped++; continue; }
    const cat = r.categorySlug ? await db.category.findUnique({ where: { slug: r.categorySlug }, select: { id: true } }) : null;
    const existing = await db.product.findUnique({ where: { slug: r.slug }, select: { id: true } });
    if (existing) {
      await db.product.update({ where: { id: existing.id }, data: { name: r.name, description: r.description ?? undefined, categoryId: cat?.id, status: (r.status as ProductStatus) ?? undefined, updatedById: actor.actorId } });
      if (r.mrpPaise != null || r.sellingPaise != null) await db.pricing.upsert({ where: { productId: existing.id }, create: { productId: existing.id, mrpPaise: r.mrpPaise ?? 0, sellingPaise: r.sellingPaise ?? 0, taxBps: r.taxBps ?? 0 }, update: { mrpPaise: r.mrpPaise ?? undefined, sellingPaise: r.sellingPaise ?? undefined, taxBps: r.taxBps ?? undefined } });
      await logProductEvent(db, existing.id, "UPDATED", "Updated via import", undefined, actor);
      updated++;
    } else {
      const p = await db.product.create({ data: { slug: r.slug, name: r.name, description: r.description ?? r.name, categoryId: cat?.id, status: (r.status as ProductStatus) ?? "DRAFT", visible: false, updatedById: actor.actorId, ...(r.mrpPaise != null || r.sellingPaise != null ? { pricing: { create: { mrpPaise: r.mrpPaise ?? 0, sellingPaise: r.sellingPaise ?? 0, taxBps: r.taxBps ?? 0 } } } : {}) }, select: { id: true } });
      await logProductEvent(db, p.id, "CREATED", "Created via import", undefined, actor);
      created++;
    }
  }
  return { created, updated, skipped };
}

// ---------------------------------------------------------------- reports

export async function productReports(): Promise<ProductReports> {
  const products = await db.product.findMany({ where: { deletedAt: null }, include: { variants: true, pricing: true, categoryRef: { select: { name: true } } } });
  const byStatus = new Map<string, number>();
  const byCategory = new Map<string, { count: number; stock: number }>();
  const lowStock: ProductReports["lowStock"] = [];
  const outOfStock: ProductReports["outOfStock"] = [];
  let available = 0, comingSoon = 0, oos = 0, stockValue = 0;
  const rows: ProductReports["rows"] = [];

  for (const p of products) {
    byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    const stock = p.variants.reduce((s, v) => s + v.stock, 0);
    const reserved = p.variants.reduce((s, v) => s + v.reservedStock, 0);
    const cat = p.categoryRef?.name ?? p.category ?? "Uncategorised";
    const ce = byCategory.get(cat) ?? { count: 0, stock: 0 }; ce.count++; ce.stock += stock; byCategory.set(cat, ce);
    for (const v of p.variants) if (v.stock > 0 && v.stock <= v.lowStockThreshold) lowStock.push({ id: p.id, name: p.name, variant: v.label, stock: v.stock, threshold: v.lowStockThreshold });
    const isOos = p.status === "OUT_OF_STOCK" || (p.variants.length > 0 && stock <= 0);
    if (isOos) { oos++; outOfStock.push({ id: p.id, name: p.name }); }
    if (p.status === "AVAILABLE") available++;
    if (p.status === "COMING_SOON") comingSoon++;
    stockValue += (p.pricing?.sellingPaise ?? 0) * stock;
    rows.push({ slug: p.slug, name: p.name, category: cat, status: p.status, sku: p.variants[0]?.sku ?? "", stock, reserved, available: stock - reserved, mrpRupees: Math.round((p.pricing?.mrpPaise ?? 0) / 100), sellingRupees: Math.round((p.pricing?.sellingPaise ?? 0) / 100), discountPct: Math.round((p.pricing?.discountBps ?? 0) / 100), gstPct: Math.round((p.pricing?.taxBps ?? 0) / 100), featured: p.featured ? "Yes" : "No", updated: p.updatedAt.toISOString().slice(0, 10) });
  }

  // sales/performance: units + revenue per product via paid order items.
  const items = await db.orderItem.groupBy({ by: ["productName"], where: { order: { status: "PAID" } }, _sum: { quantity: true, lineTotalPaise: true } });
  const performance = items.map((i) => ({ id: i.productName, name: i.productName, units: i._sum?.quantity ?? 0, revenuePaise: i._sum?.lineTotalPaise ?? 0 })).sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 20);

  return {
    byStatus: [...byStatus].map(([status, count]) => ({ status, count })),
    byCategory: [...byCategory].map(([category, v]) => ({ category, count: v.count, stock: v.stock })),
    lowStock, outOfStock, performance,
    availability: { available, comingSoon, outOfStock: oos, total: products.length },
    stockValuePaise: stockValue, rows,
  };
}
