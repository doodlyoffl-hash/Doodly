/* /api/admin/reviews — Review Management (moderation + analytics, internal only).
   GET  ?view=list  — ALL reviews (1–5★) w/ filters: rating, status, productSlug,
                      q (customer/text), from/to. (support:view)
   GET  ?view=analytics — totals, average, 1–5 distribution, product-wise,
                      6-month trend, reply stats. (support:view)
   POST { action, reviewId, ... } — approve | reject | hide | feature | unfeature |
                      reply { reply }. All actions audited. (support:edit) */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.reviews", async (req: NextRequest) => {
  requirePermission(req, "support", "view");
  const sp = req.nextUrl.searchParams;

  if (sp.get("view") === "analytics") {
    const [total, avg, dist, byProduct, replied, recent] = await Promise.all([
      db.review.count(),
      db.review.aggregate({ _avg: { rating: true } }),
      db.review.groupBy({ by: ["rating"], _count: true }),
      db.review.groupBy({ by: ["productSlug"], _count: true, _avg: { rating: true } }),
      db.review.aggregate({ where: { reply: { not: null } }, _count: true }),
      db.review.findMany({ where: { createdAt: { gte: new Date(Date.now() - 183 * 86400000) } }, select: { createdAt: true, rating: true } }),
    ]);
    const months: Record<string, { count: number; sum: number }> = {};
    for (const r of recent) {
      const k = r.createdAt.toISOString().slice(0, 7);
      months[k] = months[k] || { count: 0, sum: 0 };
      months[k].count++; months[k].sum += r.rating;
    }
    return ok({
      total,
      average: Math.round((avg._avg.rating ?? 0) * 100) / 100,
      distribution: [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: dist.find((d) => d.rating === r)?._count ?? 0 })),
      byProduct: byProduct.map((p) => ({ product: p.productSlug ?? "other", count: p._count, average: Math.round((p._avg.rating ?? 0) * 100) / 100 })),
      monthly: Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, count: v.count, average: Math.round((v.sum / v.count) * 100) / 100 })),
      replied: replied._count,
    });
  }

  const where: Prisma.ReviewWhereInput = {};
  if (sp.get("rating")) where.rating = Number(sp.get("rating"));
  if (sp.get("status")) where.status = String(sp.get("status")).toUpperCase();
  if (sp.get("productSlug")) where.productSlug = sp.get("productSlug");
  if (sp.get("from") || sp.get("to")) where.createdAt = { ...(sp.get("from") ? { gte: new Date(sp.get("from")!) } : {}), ...(sp.get("to") ? { lte: new Date(sp.get("to")!) } : {}) };
  if (sp.get("q")?.trim()) {
    const q = sp.get("q")!.trim();
    where.OR = [
      { comment: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } }, { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  const reviews = await db.review.findMany({
    where, orderBy: { createdAt: "desc" }, take: Math.min(500, Number(sp.get("limit")) || 200),
    select: {
      id: true, rating: true, title: true, comment: true, target: true, productSlug: true, orderId: true,
      status: true, featured: true, reply: true, repliedAt: true, moderatedBy: true, moderatedAt: true, createdAt: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  return ok({ reviews });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), reviewId: z.string().min(1) }),
  z.object({ action: z.literal("reject"), reviewId: z.string().min(1) }),
  z.object({ action: z.literal("hide"), reviewId: z.string().min(1) }),
  z.object({ action: z.literal("feature"), reviewId: z.string().min(1) }),
  z.object({ action: z.literal("unfeature"), reviewId: z.string().min(1) }),
  z.object({ action: z.literal("reply"), reviewId: z.string().min(1), reply: z.string().trim().min(1).max(1000) }),
]);

export const POST = route("admin.reviews.action", async (req: NextRequest) => {
  const role = requirePermission(req, "support", "edit");
  const body = await parseBody(req, schema);
  const existing = await db.review.findUnique({ where: { id: body.reviewId }, select: { id: true, status: true } });
  if (!existing) throw Errors.notFound("Review not found.");

  const stamp = { moderatedBy: `${role}${readUserId(req) ? ":" + readUserId(req) : ""}`.slice(0, 80), moderatedAt: new Date() };
  const data: Prisma.ReviewUpdateInput =
    body.action === "approve" ? { status: "APPROVED", ...stamp }
    : body.action === "reject" ? { status: "REJECTED", featured: false, ...stamp }
    : body.action === "hide" ? { status: "HIDDEN", featured: false, ...stamp }
    : body.action === "feature" ? { featured: true, ...stamp }
    : body.action === "unfeature" ? { featured: false, ...stamp }
    : { reply: body.reply, repliedAt: new Date(), ...stamp };

  const review = await db.review.update({ where: { id: body.reviewId }, data });
  await audit({ actorRole: role, action: `review.${body.action}`, target: `${body.reviewId} (${existing.status} → ${review.status})`, ctx: reqContext(req) });
  return ok({ review: { id: review.id, status: review.status, featured: review.featured, reply: review.reply } });
});
