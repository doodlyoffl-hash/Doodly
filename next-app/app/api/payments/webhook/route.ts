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
import { releaseCheckoutHolds } from "@/lib/checkout/service";
import { settleOrderPaid } from "@/lib/orders/settle";
import { notify } from "@/lib/notifications/dispatch";
import { earn } from "@/lib/loyalty/service";

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
    event?.payload?.payment?.entity?.id ?? event?.payload?.subscription?.entity?.id ?? event?.payload?.payment_link?.entity?.id ?? null;
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
        // Single shared settlement path (flip order + confirm + referral/cashback/loyalty/
        // invoice/delivery/stock/ledger) — identical + idempotent with the webhook race.
        const ledgerId = op ? await settleOrderPaid(op) : null;
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: p.id, paymentId: ledgerId ?? undefined, processed: true }).catch(() => {});
        break;
      }
      case "payment_link.paid": {
        // Assisted-order Payment Link paid → mark our Payment PAID + run the SAME settlement.
        const link = event.payload.payment_link?.entity;    // { id: plink_, notes: { orderId, userId } }
        const pay = event.payload.payment?.entity;           // { id: pay_, order_id }
        const linkId: string | undefined = link?.id;
        const notesOrderId: string | undefined = link?.notes?.orderId;
        if (linkId || notesOrderId) {
          const where = linkId ? { razorpayLinkId: linkId } : { orderId: notesOrderId! };
          await db.payment.updateMany({ where, data: { status: "PAID", razorpayPayId: pay?.id ?? undefined, razorpayOrderId: pay?.order_id ?? undefined } });
          const op = await db.payment.findFirst({ where, select: { id: true, userId: true, orderId: true } });
          const ledgerId = op ? await settleOrderPaid(op) : null;
          await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: pay?.id ?? linkId, paymentId: ledgerId ?? undefined, processed: true }).catch(() => {});
        } else {
          await recordWebhook({ eventType: event.event, signatureValid: true, processed: false }).catch(() => {});
        }
        break;
      }
      case "payment_link.cancelled":
      case "payment_link.expired": {
        // The link lapsed before payment → release any coupon/wallet held against the order
        // (credits the wallet back; never touches a PAID order).
        const link = event.payload.payment_link?.entity;
        const linkId: string | undefined = link?.id;
        const notesOrderId: string | undefined = link?.notes?.orderId;
        const op = (linkId || notesOrderId)
          ? await db.payment.findFirst({ where: linkId ? { razorpayLinkId: linkId } : { orderId: notesOrderId! }, select: { orderId: true } })
          : null;
        if (op?.orderId) { try { await releaseCheckoutHolds(op.orderId, `Payment link ${event.event === "payment_link.expired" ? "expired" : "cancelled"}`); } catch (e) { console.error("webhook.link.release", (e as Error)?.message); } }
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: linkId, processed: true }).catch(() => {});
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
        // Auto-pay renewal succeeded → generate the new cycle's deliveries + extend + log.
        const sub = event.payload.subscription.entity;
        const payId: string | null = event.payload.payment?.entity?.id ?? null;
        await db.autopaySubscription.updateMany({
          where: { gatewaySubId: sub.id },
          data: { status: "ACTIVE", attempts: 0, nextRenewalAt: new Date(sub.current_end * 1000) },
        }).catch(() => {});
        // DOODLY Pure Rewards: renewal points (idempotent per subscription + billing cycle)
        // + renewal confirmation on WhatsApp (vars: [name, plan, next renewal date])
        try {
          const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId: sub.id }, select: { subscriptionId: true } });
          if (ap?.subscriptionId) {
            const s = await db.subscription.findUnique({ where: { id: ap.subscriptionId }, select: { userId: true, plan: { select: { name: true, days: true } } } });
            if (s) {
              await earn.renewal(s.userId, ap.subscriptionId, Math.floor(Number(sub.current_end) || 0));
              // Renewal → materialise the paid-for cycle's Delivery rows. ABSOLUTE target
              // (paid_count × plan.days) is idempotent + self-correcting: safe on webhook replays
              // and whether cycle 1 arrives as `activated` or `charged`. Without this the customer
              // is charged every cycle but no Delivery rows are ever created (receives nothing).
              const paidCount = Number(sub.paid_count) || 0;
              if (paidCount > 0 && s.plan?.days) {
                try { const { renewSubscriptionCycle } = await import("@/lib/subscriptions/deliveries"); await renewSubscriptionCycle(ap.subscriptionId, s.plan.days, { absoluteTarget: paidCount * s.plan.days, cycleRef: payId, source: `AutoPay cycle ${paidCount}` }, { actorRole: "system" }); } catch (e) { console.error("renewal.generate", (e as Error)?.message); }
              } else if (s.plan?.days) { console.error("renewal.generate", `subscription.charged for ${ap.subscriptionId} carried no paid_count — deliveries NOT generated`); }
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
          await recordRenewal(sub.id, Math.round(Number(event.payload.payment?.entity?.amount ?? 0)) || 0, true, payId ?? undefined);
        } catch { /* non-blocking */ }
        // Replay-guard parity: the top-level dedup keys on payment.entity.id, so record with the
        // SAME ref (was sub.id → the two never matched → renewals weren't actually deduped).
        await recordWebhook({ eventType: event.event, signatureValid: true, paymentRef: payId ?? sub.id, processed: true }).catch(() => {});
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
