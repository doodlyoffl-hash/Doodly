/* POST /api/payments/order — create a Razorpay order for a one-time checkout.
   SECURITY: the amount is computed SERVER-SIDE from the catalogue + pricing
   engine from a product selection (variantId/planId). The client never supplies
   a price, so it cannot under-pay. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/lib/razorpay";
import { quote } from "@/lib/pricing";
import { resolveCheckoutPricing } from "@/lib/catalogue/service";

export const runtime = "nodejs";

const Body = z.object({
  variantId: z.string().min(1),
  planId: z.string().optional(),       // required for SUBSCRIPTION variants
  bottles: z.number().int().positive().max(20).optional(),
  receipt: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  const { variantId, planId, bottles = 1, receipt } = parsed.data;

  // Resolve the trusted price from the DB (admin-editable), keyed off the stable
  // catalogue id — NEVER from the client. resolveCheckoutPricing reads the live
  // DB price/discount/deposit and falls back to config only when a row is missing,
  // so admin price edits in the Products module reach this Razorpay charge too.
  const pricing = await resolveCheckoutPricing(variantId, planId);
  if (!pricing) return NextResponse.json({ error: "Unknown product variant" }, { status: 422 });
  const { variant, plan } = pricing;
  if (variant.type === "SUBSCRIPTION" && !plan) return NextResponse.json({ error: "A plan is required for this product" }, { status: 422 });

  let amountPaise: number;
  try {
    const q = quote(
      { type: variant.type, ml: variant.ml, dailyPaise: variant.dailyPaise, fixedPaise: variant.fixedPaise, fixedDays: variant.fixedDays },
      plan ? { days: plan.days, discountBps: plan.discountBps } : undefined,
    );
    // quote() prices ONE bottle per delivery — scale the milk line by the bottles ordered
    // (same fix as lib/checkout/service.ts; without it a multi-bottle order is charged for one).
    // Subscriptions carry a refundable glass-bottle deposit per bottle (DB-authoritative).
    amountPaise = q.totalPaise * bottles + (variant.type === "SUBSCRIPTION" ? pricing.depositPaise * bottles : 0);
  } catch {
    return NextResponse.json({ error: "Could not price this selection" }, { status: 422 });
  }
  if (amountPaise <= 0) return NextResponse.json({ error: "Invalid order amount" }, { status: 422 });

  try {
    const order = await createOrder(amountPaise, { receipt });
    return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (e) {
    console.error("razorpay.order", (e as Error)?.message);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
