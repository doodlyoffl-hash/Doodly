/* /api/account/reviews — verified product reviews (DOODLY Pure Rewards).
   GET  — the customer's own reviews + which delivered orders can still be reviewed.
   POST — submit a review for one of THEIR delivered orders (server-verified:
          order ownership + PAID + actually delivered). One review per order
          (Review.orderId UNIQUE — DB-enforced) → awards the loyalty points
          once (earn.review is idempotent per order). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { earn } from "@/lib/loyalty/service";
import { getLoyaltyConfig } from "@/lib/loyalty/config";
import { recomputeProductRating } from "@/lib/reviews/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderLabel = (o: { items: { quantity: number; productName: string; variantLabel: string | null }[] }) =>
  o.items.map((i) => `${i.quantity}× ${i.productName}${i.variantLabel ? " " + i.variantLabel : ""}`.trim()).join(", ") || "Order";

/** Was this PAID order actually delivered? Direct one-off deliveries link by
    orderId; subscription orders count as delivered once any of the customer's
    deliveries on/after the order date completed. */
async function isDelivered(userId: string, order: { id: string; type: string; createdAt: Date }) {
  const direct = await db.delivery.findFirst({ where: { orderId: order.id, status: "DELIVERED" }, select: { id: true } });
  if (direct) return true;
  if (order.type !== "SUBSCRIPTION") return false;
  const viaSub = await db.delivery.findFirst({
    where: { subscription: { userId }, status: "DELIVERED", date: { gte: order.createdAt } },
    select: { id: true },
  });
  return !!viaSub;
}

export const GET = route("account.reviews.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const [reviews, paidOrders, cfg] = await Promise.all([
    db.review.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.order.findMany({
      where: { userId, status: "PAID", cancelledAt: null },
      orderBy: { createdAt: "desc" }, take: 25,
      include: { items: { select: { quantity: true, productName: true, variantLabel: true, productSlug: true } } },
    }),
    getLoyaltyConfig(),
  ]);
  const reviewedIds = new Set(reviews.map((r) => r.orderId).filter(Boolean));
  // once per PRODUCT: an order whose product this customer already reviewed isn't reviewable again
  const reviewedProducts = new Set(reviews.filter((r) => r.orderId && r.productSlug).map((r) => r.productSlug as string));
  const reviewable: { orderId: string; number: string; label: string; productSlug: string | null; placedAt: string }[] = [];
  for (const o of paidOrders) {
    if (reviewedIds.has(o.id)) continue;
    const slug = o.items[0]?.productSlug ?? null;
    if (slug && reviewedProducts.has(slug)) continue;
    if (await isDelivered(userId, o)) {
      reviewable.push({ orderId: o.id, number: `DOO-${o.id.slice(-6).toUpperCase()}`, label: orderLabel(o), productSlug: slug, placedAt: o.createdAt.toISOString() });
    }
  }
  return ok({
    pointsPerReview: cfg.enabled ? cfg.earnReview : 0,
    reviewable,
    reviews: reviews.map((r) => ({ id: r.id, orderId: r.orderId, target: r.target, productSlug: r.productSlug, title: r.title, status: r.status, rating: r.rating, comment: r.comment, createdAt: r.createdAt.toISOString() })),
  });
});

const postSchema = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  comment: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
});

export const POST = route("account.reviews.create", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, postSchema);

  // the order must be the customer's own, paid, not cancelled — never trust the client
  const order = await db.order.findFirst({
    where: { id: body.orderId, userId, status: "PAID", cancelledAt: null },
    include: { items: { select: { quantity: true, productName: true, variantLabel: true, productSlug: true } } },
  });
  if (!order) throw Errors.notFound("Order not found on your account (only paid orders can be reviewed).");
  if (!(await isDelivered(userId, order))) throw Errors.badRequest("You can review this order once it has been delivered.");

  // ONE feedback per purchased product: buying the same product again does not
  // grant another public review slot (edit the existing one instead).
  const slug = order.items[0]?.productSlug ?? null;
  if (slug) {
    const dupProduct = await db.review.findFirst({ where: { userId, productSlug: slug, orderId: { not: null } }, select: { id: true } });
    if (dupProduct) throw Errors.conflict("You've already reviewed this product — you can edit your existing review instead.");
  }

  let review;
  try {
    review = await db.review.create({
      data: {
        userId, target: orderLabel(order).slice(0, 120), productSlug: slug,
        title: body.title, rating: body.rating, comment: body.comment, orderId: order.id,
        status: "PENDING",   // moderation gate: nothing goes public until an admin approves
      },
    });
  } catch (e) {
    // unique orderId OR the partial (userId, productSlug) index → duplicate (race-safe)
    throw Errors.conflict("You've already reviewed this — you can edit your existing review instead.");
  }

  await audit({ userId, actorRole: "customer", action: "review.create", target: `${order.id} ${body.rating}★`, ctx: reqContext(req) });
  // Low-rating workflow: 1–2★ alerts admins/support so they can follow up (feedback is never deleted).
  if (body.rating <= 2) {
    try {
      const { notify } = await import("@/lib/notifications/dispatch");
      const admins = await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN", "SUPPORT"] }, status: "ACTIVE" }, select: { id: true }, take: 10 });
      const who = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
      await Promise.all(admins.map((a) => notify(a.id, {
        title: `⚠️ ${body.rating}★ review needs follow-up`,
        body: `${who?.name || "A customer"} rated order ${order.id.slice(-6).toUpperCase()} ${body.rating}★${body.comment ? `: "${body.comment.slice(0, 140)}"` : ""} — review it in Admin → Reviews.`,
      })));
    } catch { /* non-blocking */ }
  }
  // DOODLY Pure Rewards: verified-review points, once per delivered order (idempotent)
  const earned = await earn.review(userId, order.id);

  return ok({
    review: { id: review.id, orderId: review.orderId, rating: review.rating, comment: review.comment, createdAt: review.createdAt.toISOString() },
    pointsAwarded: "awarded" in earned && earned.awarded ? earned.points : 0,
  }, { status: 201 });
});

const patchSchema = z.object({
  reviewId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  comment: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
});

/** PATCH — edit YOUR OWN review (business rule: allowed, but every edit goes
    back through moderation: status resets to PENDING and the product's public
    aggregate is recomputed immediately, so an edited review never stays
    public un-reviewed). */
export const PATCH = route("account.reviews.update", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, patchSchema);
  const existing = await db.review.findFirst({ where: { id: body.reviewId, userId }, select: { id: true, productSlug: true } });
  if (!existing) throw Errors.notFound("Review not found on your account.");

  const review = await db.review.update({
    where: { id: existing.id },
    data: {
      rating: body.rating,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.comment !== undefined ? { comment: body.comment } : {}),
      status: "PENDING", featured: false, moderatedBy: null, moderatedAt: null,
    },
  });
  await recomputeProductRating(existing.productSlug);   // an edited (now-pending) review leaves the public aggregate
  await audit({ userId, actorRole: "customer", action: "review.edit", target: `${existing.id} → ${body.rating}★ (re-moderation)`, ctx: reqContext(req) });
  return ok({ review: { id: review.id, rating: review.rating, title: review.title, comment: review.comment, status: review.status } });
});
