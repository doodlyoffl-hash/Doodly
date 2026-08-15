/* GET /api/admin/orders/duplicate-check — guard against accidental duplicate assisted
   orders (Part 6). Pure read (assistedOrders:view). Returns recent non-cancelled orders
   for the customer, flagged as a possible duplicate when one matches the same product
   within the window. Staff still confirm explicitly before placing.
   Query: ?customerId=<id>&variantId=<catalogue variant>&days=<1..30, default 2> */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { resolveCheckoutPricing } from "@/lib/catalogue/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.orders.duplicateCheck", async (req: NextRequest) => {
  requirePermission(req, "assistedOrders", "view");
  const q = new URL(req.url).searchParams;
  const customerId = q.get("customerId")?.trim();
  if (!customerId) throw Errors.badRequest("customerId is required.");
  const variantId = q.get("variantId")?.trim();
  const days = Math.min(30, Math.max(1, Number(q.get("days")) || 2));
  const since = new Date(Date.now() - days * 86_400_000);

  // Resolve the product identity so "same product" comparison is meaningful.
  let productSlug: string | undefined, variantLabel: string | undefined;
  if (variantId) {
    const p = await resolveCheckoutPricing(variantId).catch(() => null);
    if (p) { productSlug = p.variant.productSlug; variantLabel = p.variant.label; }
  }

  const recent = await db.order.findMany({
    where: {
      userId: customerId, cancelledAt: null, createdAt: { gte: since },
      ...(productSlug ? { items: { some: { productSlug, ...(variantLabel ? { variantLabel } : {}) } } } : {}),
    },
    orderBy: { createdAt: "desc" }, take: 10,
    select: {
      id: true, createdAt: true, status: true, totalPaise: true, type: true, source: true,
      items: { select: { productName: true, variantLabel: true, quantity: true } },
    },
  });

  return ok({ duplicate: recent.length > 0, windowDays: days, matchedProduct: !!productSlug, recent });
});
