/* =============================================================
   Product rating aggregates — ONE source of truth for the stars
   shown anywhere on the platform (PDP, cards, related rail, search).

   recomputeProductRating(slug): average + count over APPROVED,
   VERIFIED (order-linked) reviews → persisted onto the existing
   Product.ratingValue / Product.ratingCount columns, which every
   product surface reads. Called after any moderation transition or
   customer edit, so ratings update automatically platform-wide.
   productStats(slug): live stats + 1–5 distribution for the PDP.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";

const APPROVED_VERIFIED = (productSlug: string) => ({
  productSlug, status: "APPROVED", orderId: { not: null as unknown as string } as { not: string },
});

/** Recompute + persist a product's average rating and count. Never throws. */
export async function recomputeProductRating(productSlug?: string | null) {
  if (!productSlug) return;
  try {
    const agg = await db.review.aggregate({
      where: { productSlug, status: "APPROVED", orderId: { not: null } },
      _avg: { rating: true }, _count: true,
    });
    await db.product.updateMany({
      where: { slug: productSlug },
      data: { ratingValue: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count },
    });
  } catch (e) {
    log.error("reviews.aggregate", (e as Error)?.message ?? "recompute failed", { productSlug });
  }
}

/** Public PDP stats: average, counts and the 1–5 star distribution (percent). */
export async function productStats(productSlug: string) {
  const [agg, dist, withText] = await Promise.all([
    db.review.aggregate({ where: { productSlug, status: "APPROVED", orderId: { not: null } }, _avg: { rating: true }, _count: true }),
    db.review.groupBy({ by: ["rating"], where: { productSlug, status: "APPROVED", orderId: { not: null } }, _count: true }),
    db.review.count({ where: { productSlug, status: "APPROVED", orderId: { not: null }, OR: [{ comment: { not: null } }, { title: { not: null } }] } }),
  ]);
  const total = agg._count;
  return {
    average: Math.round((agg._avg.rating ?? 0) * 10) / 10,
    ratings: total,
    reviews: withText,
    distribution: [5, 4, 3, 2, 1].map((r) => {
      const count = dist.find((d) => d.rating === r)?._count ?? 0;
      return { rating: r, count, pct: total ? Math.round((count / total) * 100) : 0 };
    }),
  };
}
