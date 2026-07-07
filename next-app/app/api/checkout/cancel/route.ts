/* POST /api/checkout/cancel — release the coupon + wallet held against a PENDING
   checkout order when the customer dismisses the payment popup. Owner-only and
   never touches a PAID order; the wallet is credited back and the coupon usage
   is released (also handled by the webhook payment.failed as a backstop). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { db } from "@/lib/db";
import { releaseCheckoutHolds } from "@/lib/checkout/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ orderId: z.string().min(1).max(40) });

export const POST = route("checkout.cancel", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const { orderId } = await parseBody(req, Body);
  const order = await db.order.findFirst({ where: { id: orderId, userId }, select: { status: true } });
  if (!order || order.status === "PAID") return ok({ released: false });
  await releaseCheckoutHolds(orderId, "Payment cancelled by customer");
  return ok({ released: true });
});
