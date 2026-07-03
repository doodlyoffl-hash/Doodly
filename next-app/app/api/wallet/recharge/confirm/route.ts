/* POST /api/wallet/recharge/confirm — complete a wallet top-up after
   Razorpay Checkout succeeds. Verifies the payment signature, re-fetches
   the order from Razorpay (server-trusted amount + owner tag), then credits
   the wallet idempotently with the payment id as the reference — a retried
   or replayed confirm can never double-credit, and one customer can never
   claim another customer's payment. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPaymentSignature, fetchOrder } from "@/lib/razorpay";
import { rechargeWallet } from "@/lib/wallet/service";
import { currentUserId, actorRole } from "@/lib/wallet/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  razorpay_order_id: z.string().min(5),
  razorpay_payment_id: z.string().min(5),
  razorpay_signature: z.string().min(10),
});

export async function POST(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
    return NextResponse.json({ verified: false, error: "Payment could not be verified." }, { status: 400 });
  }

  // server-trusted amount + ownership from the order we created
  let order;
  try { order = await fetchOrder(razorpay_order_id); }
  catch (e) {
    console.error("wallet.recharge.confirm.fetch", (e as Error)?.message);
    return NextResponse.json({ error: "Could not confirm the payment. Contact support if you were charged." }, { status: 502 });
  }
  const notes = (order.notes ?? {}) as Record<string, string>;
  if (notes.purpose !== "wallet_recharge") return NextResponse.json({ error: "This payment is not a wallet recharge." }, { status: 400 });
  if (notes.userId !== userId) return NextResponse.json({ error: "This payment belongs to a different account." }, { status: 403 });

  const result = await rechargeWallet({
    userId, actorId: userId, actorRole: actorRole(req),
    amountPaise: Number(order.amount), reference: razorpay_payment_id, method: "razorpay",
  });
  if (!("ok" in result) || !result.ok) return NextResponse.json({ error: "Recharge rejected", ...result }, { status: 409 });

  if (!result.idempotent) {
    await audit({ userId, actorRole: actorRole(req), action: "wallet.recharge", target: razorpay_payment_id, ctx: reqContext(req) });
  }
  return NextResponse.json({ verified: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
