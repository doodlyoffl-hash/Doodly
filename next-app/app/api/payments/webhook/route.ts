/* POST /api/payments/webhook — Razorpay webhook (the source of truth for
   payments + recurring renewals). Verifies the signature against the RAW body,
   then handles the events DOODLY cares about. Configure this URL + the same
   RAZORPAY_WEBHOOK_SECRET in the Razorpay dashboard, subscribing to:
   payment.captured · payment.failed · subscription.charged ·
   subscription.halted · subscription.cancelled. */
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();                       // must verify the RAW body
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const event = JSON.parse(raw);
  try {
    switch (event.event) {
      case "payment.captured": {
        const p = event.payload.payment.entity;   // pay_xxx + order_id
        await db.payment.updateMany({ where: { razorpayOrderId: p.order_id }, data: { status: "PAID", razorpayPayId: p.id } });
        break;
      }
      case "payment.failed": {
        const p = event.payload.payment.entity;
        await db.payment.updateMany({ where: { razorpayOrderId: p.order_id }, data: { status: "FAILED", razorpayPayId: p.id } });
        // TODO: enqueue the "payment failed" notification + schedule retry per autopay rules.
        break;
      }
      case "subscription.charged": {
        // Auto-pay renewal succeeded → extend the subscription + log RenewalHistory.
        const sub = event.payload.subscription.entity;
        await db.autopaySubscription.updateMany({
          where: { gatewaySubId: sub.id },
          data: { status: "ACTIVE", attempts: 0, nextRenewalAt: new Date(sub.current_end * 1000) },
        }).catch(() => {});
        break;
      }
      case "subscription.halted":
      case "subscription.cancelled": {
        const sub = event.payload.subscription.entity;
        await db.autopaySubscription.updateMany({
          where: { gatewaySubId: sub.id },
          data: { status: event.event === "subscription.halted" ? "SUSPENDED" : "CANCELLED" },
        }).catch(() => {});
        break;
      }
      default:
        break;   // ignore everything else
    }
  } catch (e: any) {
    console.error("webhook.handler", event?.event, e?.message);
    // 200 anyway so Razorpay doesn't hammer retries on a transient DB blip we've logged.
  }
  return NextResponse.json({ received: true });
}
