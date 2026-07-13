/* POST /api/payments/verify — success callback from Razorpay Checkout.
   Verifies the signature, then marks the order paid. The webhook is the
   source of truth; this gives the customer an instant confirmation. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { db } from "@/lib/db";
import { creditTrialCashback } from "@/lib/wallet/service";
import { maybeAwardReferralForUser } from "@/lib/referrals/service";
import { syncFromOrderPayment } from "@/lib/payments/service";
import { notifyOrderConfirmed } from "@/lib/notifications/dispatch";
import { awardOrderPaid } from "@/lib/loyalty/service";
import { ensureInvoiceForOrder } from "@/lib/orders/service";
import { ensureDeliveryForOrder } from "@/lib/orders/delivery-bridge";

const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

export const runtime = "nodejs";

const Body = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const ok = verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
  if (!ok) return NextResponse.json({ verified: false, error: "Signature mismatch" }, { status: 400 });

  // Mark the pre-created Payment row (made at order time) as PAID. Idempotent;
  // the webhook is the source of truth, this is just for instant UX.
  const payment = await db.payment.findFirst({ where: { razorpayOrderId: razorpay_order_id }, select: { id: true, userId: true, orderId: true } });
  await db.payment.updateMany({
    where: { razorpayOrderId: razorpay_order_id },
    data: { status: "PAID", razorpayPayId: razorpay_payment_id },
  }).catch((e) => console.error("payment.update", e?.message));

  // Mark the order paid + (idempotently) credit the Trial Pack cashback if the
  // customer just upgraded to an eligible plan. Never blocks the confirmation.
  let cashback: { credited: boolean; amountPaise?: number; balancePaise?: number; reference?: string } | null = null;
  if (payment) {
    // Flip only if not already PAID (webhook may have won the race) so the
    // confirmation notification fires exactly once per order.
    const flip = await db.order.updateMany({ where: { id: payment.orderId, status: { not: "PAID" } }, data: { status: "PAID" } }).catch(() => ({ count: 0 }));
    if (flip.count > 0) { try { await notifyOrderConfirmed(payment.userId, { number: num(payment.orderId) }); } catch { /* non-blocking */ } }
    // Sync this gateway payment into the unified Payments ledger (best-effort).
    await syncFromOrderPayment(payment.id).catch((e) => console.error("payment.ledgerSync", (e as Error)?.message));
    try { cashback = await creditTrialCashback({ userId: payment.userId }); }
    catch (e) { console.error("payment.cashback", (e as Error)?.message); }
    // referral reward — credit the referrer if this buyer now has a qualifying subscription (non-blocking)
    await maybeAwardReferralForUser(payment.userId, { actorRole: "system" });
    // DOODLY Pure Rewards: order + subscription points (idempotent; webhook may also call this)
    await awardOrderPaid(payment.userId, payment.orderId);
    // Auto-generate + email the B2C invoice now that the order is PAID (idempotent; webhook may also call this).
    try { await ensureInvoiceForOrder(payment.orderId); } catch (e) { console.error("invoice.ensure", (e as Error)?.message); }
    // Order → Delivery bridge: create the delivery so it enters the assignment flow (idempotent).
    try { await ensureDeliveryForOrder(payment.orderId); } catch (e) { console.error("delivery.ensure", (e as Error)?.message); }
  }

  return NextResponse.json({ verified: true, cashback });
}
