/* GET /api/reviews/public — the ONLY review feed the public website sees.
   Hard server-side gate: status APPROVED ∧ rating 5 ∧ verified (orderId set).
   1–4★, pending, rejected, hidden and unverified reviews can never appear here.
   Featured first, then newest. Names are anonymized ("Vivek D."). No auth. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { productStats } from "@/lib/reviews/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anon = (name?: string | null) => {
  const parts = String(name || "A DOODLY customer").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

export const GET = route("reviews.public", async (req: NextRequest) => {
  const limit = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 9));
  const productSlug = req.nextUrl.searchParams.get("productSlug")?.trim() || null;
  // PDP mode: true aggregate stats (average + 1–5 distribution over ALL approved
  // verified ratings — honest numbers) alongside the review list, which keeps
  // DOODLY's public moderation policy (approved + verified + 5★).
  const stats = productSlug ? await productStats(productSlug) : null;
  const rows = await db.review.findMany({
    where: { status: "APPROVED", rating: 5, orderId: { not: null }, ...(productSlug ? { productSlug } : {}) },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { id: true, title: true, comment: true, rating: true, target: true, productSlug: true, featured: true, createdAt: true, user: { select: { name: true } } },
  });
  return ok({
    stats,
    reviews: rows.map((r) => ({
      id: r.id,
      name: anon(r.user?.name),
      rating: r.rating,
      title: r.title,
      text: r.comment || r.title || "",
      product: r.target,
      productSlug: r.productSlug,
      featured: r.featured,
      verified: true,
      date: r.createdAt.toISOString(),
    })),
  });
});
