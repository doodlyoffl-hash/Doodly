/* POST /api/payments/webhook — Razorpay webhook (the source of truth for
   payments + recurring renewals). Verifies the signature against the RAW body,
   then handles the events DOODLY cares about. Configure this URL + the same
   RAZORPAY_WEBHOOK_SECRET in the Razorpay dashboard, subscribing to:
   payment.captured · payment.failed · subscription.charged ·
   subscription.halted · subscription.cancelled. */
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { db } from "@/lib/db";
import { syncFromOrderPayment, recordWebhook } from "@/lib/payments/service";
import { maybeAwardReferralForUser } from "@/lib/referrals/service";
import { releaseCheckoutHolds } from "@/lib/checkout/service";
import { notify, notifyOrderConfirmed } from "@/lib/notifications/dispatch";
import { awardOrderPaid, earn } from "@/lib/loyalty/service";

export const runtime = "nodejs";

const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

export async function POST(req: NextRequest) {
  const raw = await req.text();                       // must verify the RAW body
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) {
    // Log the rejected webhook for the admin gateway-webhook audit, then 401.
    await recordWebhook({ eventType: "unknown", signatureValid: false, error: "signature mismatch", processed: false }).catch(() => {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw);

  // Replay guard — Razorpay retries deliveries. Each (event, payment-ref) pair
  // is processed exactly once; duplicates are acknowledged without re-running
  // the ledger sync (prevents double bookkeeping on webhook replays).
  const dedupeRef: string | null =
    event?.payload?.payment?.entity?.id ?? event?.payload?.subscription?.entity?.id ?? null;
  if (dedupeRef) {
    const dup = await db.gatewayWebhook.findFirst({
      where: { eventType: event.event, paymentRef: dedupeRef, processed: true },
      select: { id: true },
    }).catch(() => null);
    if (dup) return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.event) {
      case "payment.captured": {
        const p = event.payload.payment.entity;   // pay_xxx + order_id
        await db.payment.updateMany({ where: { razorpayOrderId: p.order_id }, data: { status: "PAID", razorpayPayId: p.id } });
        const op = await db.payment.findFirst({ where: { razorpayOrderId: p.order_id }, select: { id: true, userId: true, orderId: true } });
        // Flip the order to PAID (idempotent) and confirm the customer exactly once —
        // whichever of webhook / verify wins the race fires the notification.
        if (op?.orderId) {
          const flip = await db.order.updateMany({ where: { id: op.orderId, status: { not: "PAID" } }, data: { status: "PAID" } }).catch(() => ({ count: 0 }));
          if (flip.count > 0) { try { await notifyOrderConfirmed(op.userId, { number: num(op.orderId) }); } catch { /* non-blocking */ } }
          // referral reward — credit the referrer if this buyer now has a qualifying subscription (idempotent, non-blocking)
          await maybeAwardReferralForUser(op.userId, { actorRole: "system" });
          // DOODLY Pure Rewards: order + subscription points (idempotent; verify may also call this)
          await awardOrderPaid(op.userId, op.orderId);
        }
        const ledgerId = op ? await syncFromOrderPayment(op.id).catch(() => null) : null;
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: p.id, paymentId: ledgerId ?? undefined, processed: true }).catch(() => {});
        break;
      }
      case "payment.failed": {
        const p = event.payload.payment.entity;
        await db.payment.updateMany({ where: { razorpayOrderId: p.order_id }, data: { status: "FAILED", razorpayPayId: p.id } });
        const op = await db.payment.findFirst({ where: { razorpayOrderId: p.order_id }, select: { id: true, userId: true, orderId: true } });
        const ledgerId = op ? await syncFromOrderPayment(op.id).catch(() => null) : null;
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: p.id, paymentId: ledgerId ?? undefined, processed: true }).catch(() => {});
        // Release any coupon + wallet held against this checkout order (credits the wallet back).
        if (op?.orderId) { try { await releaseCheckoutHolds(op.orderId, "Online payment failed"); } catch (e) { console.error("webhook.release", (e as Error)?.message); } }
        // Notify the customer their payment didn't go through (in-app + opted channels).
        if (op?.userId) {
          try {
            const { firstNameOf } = await import("@/lib/notifications/dispatch");
            const [name, ord] = await Promise.all([
              firstNameOf(op.userId),
              op.orderId ? db.order.findUnique({ where: { id: op.orderId }, select: { totalPaise: true } }) : null,
            ]);
            await notify(op.userId, {
              title: "Payment didn't go through",
              body: "We couldn't process your recent DOODLY payment. No amount was charged — please retry from your dashboard or use your wallet.",
              email: true,
              sms: { template: "payment_failed" },
              // vars: [name, amount ₹, order number]
              whatsapp: { template: "payment_failed", vars: [name, Math.round((ord?.totalPaise ?? 0) / 100).toLocaleString("en-IN"), op.orderId ? num(op.orderId) : "—"] },
            });
          } catch { /* non-blocking */ }
        }
        break;
      }
      case "subscription.charged": {
        // Auto-pay renewal succeeded → extend the subscription + log RenewalHistory.
        const sub = event.payload.subscription.entity;
        await db.autopaySubscription.updateMany({
          where: { gatewaySubId: sub.id },
          data: { status: "ACTIVE", attempts: 0, nextRenewalAt: new Date(sub.current_end * 1000) },
        }).catch(() => {});
        // DOODLY Pure Rewards: renewal points (idempotent per subscription + billing cycle)
        // + renewal confirmation on WhatsApp (vars: [name, plan, next renewal date])
        try {
          const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId: sub.id }, select: { subscriptionId: true } });
          if (ap?.subscriptionId) {
            const s = await db.subscription.findUnique({ where: { id: ap.subscriptionId }, select: { userId: true, plan: { select: { name: true } } } });
            if (s) {
              await earn.renewal(s.userId, ap.subscriptionId, Math.floor(Number(sub.current_end) || 0));
              const { firstNameOf } = await import("@/lib/notifications/dispatch");
              const nextDate = new Date(Number(sub.current_end) * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
              await notify(s.userId, {
                title: "Subscription renewed 🥛",
                body: `Your ${s.plan?.name || "DOODLY"} plan has renewed successfully. Next renewal: ${nextDate}.`,
                email: true,
                whatsapp: { template: "sub_renewed", vars: [await firstNameOf(s.userId), s.plan?.name || "DOODLY", nextDate] },
              });
            }
          }
          // AutoPay audit trail — record this renewal charge (amount from the invoice/plan)
          const { recordRenewal } = await import("@/lib/autopay/service");
          await recordRenewal(sub.id, Math.round(Number(event.payload.payment?.entity?.amount ?? 0)) || 0, true, event.payload.payment?.entity?.id);
        } catch { /* non-blocking */ }
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: sub.id, processed: true }).catch(() => {});
        break;
      }
      case "subscription.authenticated":
      case "subscription.activated": {
        // The customer authorised the mandate → AutoPay is now live.
        const sub = event.payload.subscription.entity;
        try {
          const { activateMandate } = await import("@/lib/autopay/service");
          await activateMandate(sub.id, sub.current_end ? new Date(Number(sub.current_end) * 1000) : undefined);
        } catch { /* non-blocking */ }
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: sub.id, processed: true }).catch(() => {});
        break;
      }
      case "subscription.paused": {
        const sub = event.payload.subscription.entity;
        await db.autopaySubscription.updateMany({ where: { gatewaySubId: sub.id }, data: { status: "INACTIVE" } }).catch(() => {});
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: sub.id, processed: true }).catch(() => {});
        break;
      }
      case "subscription.halted": {
        // Razorpay exhausted its retries → SUSPEND (never silent-cancel) + notify/escalate.
        const sub = event.payload.subscription.entity;
        try {
          const { recordRenewal, onMandateHalted } = await import("@/lib/autopay/service");
          await recordRenewal(sub.id, 0, false, sub.id, "Automatic renewal failed after gateway retries");
          await onMandateHalted(sub.id);
        } catch { /* non-blocking */ }
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: sub.id, processed: true }).catch(() => {});
        break;
      }
      case "subscription.cancelled": {
        const sub = event.payload.subscription.entity;
        await db.autopaySubscription.updateMany({ where: { gatewaySubId: sub.id }, data: { status: "CANCELLED" } }).catch(() => {});
        await db.autopaySubscription.findFirst({ where: { gatewaySubId: sub.id }, select: { subscriptionId: true } })
          .then((ap) => ap && db.subscription.update({ where: { id: ap.subscriptionId }, data: { autoRenew: false } })).catch(() => {});
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: sub.id, processed: true }).catch(() => {});
        break;
      }
      default:
        await recordWebhook({ eventType: event?.event ?? "unknown", signatureValid: true, processed: false }).catch(() => {});
        break;   // ignore everything else
    }
  } catch (e: any) {
    console.error("webhook.handler", event?.event, e?.message);
    // 200 anyway so Razorpay doesn't hammer retries on a transient DB blip we've logged.
  }
  return NextResponse.json({ received: true });
}
