/* =============================================================
   Related-products recommendation engine (server-only).
   Computes a de-duplicated, ordered set of related products for a
   given product using a cascade of signals — admin-assigned related,
   same category, featured, best-sellers, recommended, new arrivals —
   with an "everything else" fallback so the rail is never empty.
   Backed by real Product rows; a global on/off lives in AppSetting.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

const RECO_KEY = "products.recommendations";

// Prisma ProductStatus → storefront status key (matches assets/js/status.js)
const STATUS_MAP: Record<string, string> = {
  AVAILABLE: "available",
  DRAFT: "coming_soon",
  COMING_SOON: "coming_soon",
  OUT_OF_STOCK: "out_of_stock",
  DISCONTINUED: "discontinued",
  HIDDEN: "hidden",
  ARCHIVED: "hidden",
};

export type RelatedCard = {
  id: string; slug: string; name: string; category: string | null;
  imageUrl: string | null; status: string;
  featured: boolean; bestSeller: boolean; newArrival: boolean; recommended: boolean; comingSoon: boolean;
  ratingValue: number; ratingCount: number;
  priceFromPaise: number | null;
  reason: string;
};

export async function recoEnabled(): Promise<boolean> {
  try {
    const s = await db.appSetting.findUnique({ where: { key: RECO_KEY } });
    const v = (s?.value as { enabled?: boolean } | null) || {};
    return v.enabled !== false; // default ON
  } catch {
    return true;
  }
}

export async function setRecoEnabled(enabled: boolean) {
  await db.appSetting.upsert({
    where: { key: RECO_KEY },
    create: { key: RECO_KEY, value: { enabled } },
    update: { value: { enabled } },
  });
  return { enabled };
}

type PRow = {
  id: string; slug: string; name: string; category: string | null; categoryId: string | null;
  imageUrl: string | null; status: string; featured: boolean; bestSeller: boolean;
  newArrival: boolean; recommended: boolean; relatedSlugs: string[]; ratingValue: number; ratingCount: number;
  sortOrder: number;
  categoryRef: { name: string } | null;
  variants: { dailyPaise: number | null; fixedPaise: number | null }[];
  pricing: { sellingPaise: number } | null;
};

function priceFrom(p: PRow): number | null {
  const dailies = p.variants.map((v) => v.dailyPaise).filter((n): n is number => n != null && n > 0);
  if (dailies.length) return Math.min(...dailies);
  const trials = p.variants.map((v) => v.fixedPaise).filter((n): n is number => n != null && n > 0);
  if (trials.length) return Math.min(...trials);
  return p.pricing?.sellingPaise ?? null;
}

function toCard(p: PRow, reason: string): RelatedCard {
  return {
    id: p.id, slug: p.slug, name: p.name,
    category: p.categoryRef?.name ?? p.category ?? null,
    imageUrl: p.imageUrl, status: STATUS_MAP[p.status] ?? "available",
    featured: p.featured, bestSeller: p.bestSeller, newArrival: p.newArrival, recommended: p.recommended,
    comingSoon: p.status === "COMING_SOON" || p.status === "DRAFT",
    ratingValue: p.ratingValue, ratingCount: p.ratingCount,
    priceFromPaise: priceFrom(p), reason,
  };
}

/** Ordered, de-duplicated related products for `slug`. Never returns the product itself. */
export async function relatedProducts(slug: string, limit = 8): Promise<{ enabled: boolean; reason: string; products: RelatedCard[] }> {
  if (!(await recoEnabled())) return { enabled: false, reason: "disabled", products: [] };

  const rows = (await db.product.findMany({
    where: { deletedAt: null, visible: true, status: { not: "HIDDEN" } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      categoryRef: { select: { name: true } },
      variants: { where: { active: true }, select: { dailyPaise: true, fixedPaise: true } },
      pricing: { select: { sellingPaise: true } },
    },
  })) as unknown as PRow[];

  const bySlug = new Map(rows.map((p) => [p.slug, p]));
  const current = bySlug.get(slug) || null;
  const others = rows.filter((p) => p.slug !== slug);

  const picked = new Map<string, RelatedCard>();
  const add = (p: PRow | null | undefined, reason: string) => {
    if (p && p.slug !== slug && !picked.has(p.slug)) picked.set(p.slug, toCard(p, reason));
  };

  // Cascade — first signal to claim a product sets its position + reason.
  if (current?.relatedSlugs?.length) for (const s of current.relatedSlugs) add(bySlug.get(s), "related");
  if (current) for (const p of others) if ((p.categoryId && p.categoryId === current.categoryId) || (p.category && p.category === current.category)) add(p, "category");
  for (const p of others) if (p.featured) add(p, "featured");
  for (const p of others) if (p.bestSeller) add(p, "bestSeller");
  for (const p of others) if (p.recommended) add(p, "recommended");
  for (const p of others) if (p.newArrival) add(p, "newArrival");
  for (const p of others) add(p, "more"); // fallback so the rail is never empty

  const products = [...picked.values()].slice(0, limit);
  return { enabled: true, reason: products[0]?.reason ?? "none", products };
}

/** Toggle a boolean recommendation flag on a product (featured/bestSeller/newArrival/recommended). */
export async function setRecoFlag(id: string, flag: "featured" | "bestSeller" | "newArrival" | "recommended", value: boolean) {
  await db.product.update({ where: { id }, data: { [flag]: value } });
  return { id, flag, value };
}

/** Replace a product's admin-assigned related slugs (ordered, de-duped, self excluded). */
export async function setRelated(id: string, slugs: string[]) {
  const self = await db.product.findUnique({ where: { id }, select: { slug: true } });
  const clean = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))].filter((s) => s !== self?.slug);
  await db.product.update({ where: { id }, data: { relatedSlugs: clean } });
  return { id, relatedSlugs: clean };
}
