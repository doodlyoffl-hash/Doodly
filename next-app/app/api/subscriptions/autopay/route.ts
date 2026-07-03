/* /api/subscriptions/autopay — enable (POST) or cancel (DELETE) auto-pay for a
   subscription via a Razorpay recurring mandate. The customer authorises the
   mandate through Checkout (subscription_id); renewals then fire automatically
   and arrive on the webhook as `subscription.charged`.
   SECURITY: the caller must own the subscription (session user id) — verified
   before any mandate is created or cancelled. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSubscription, cancelSubscription } from "@/lib/razorpay";
import { db } from "@/lib/db";
import { readUserId } from "@/lib/auth/identity";

export const runtime = "nodejs";

const uid = (req: NextRequest) => readUserId(req);

const Enable = z.object({ subscriptionId: z.string(), planSlug: z.string(), totalCount: z.number().int().positive().max(120) });

export async function POST(req: NextRequest) {
  const userId = uid(req);
  if (!userId) return NextResponse.json({ error: "Sign in to enable auto-pay" }, { status: 401 });

  const parsed = Enable.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const { subscriptionId, planSlug, totalCount } = parsed.data;

  // authorization: the subscription must belong to the signed-in customer
  const owned = await db.subscription.findFirst({ where: { id: subscriptionId, userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  try {
    const rzpSub = await createSubscription(planSlug, { totalCount, customerNotify: true, notes: { subscriptionId } });
    await db.autopaySubscription.upsert({
      where: { subscriptionId },
      create: { gatewaySubId: rzpSub.id, subscriptionId, status: "ACTIVE", nextRenewalAt: new Date(), amountPaise: 0 } as any,
      update: { gatewaySubId: rzpSub.id, status: "ACTIVE" } as any,
    }).catch((e) => console.error("autopay.upsert", e?.message));
    // Return the subscription_id + key so the client can open Checkout to authorise the mandate.
    return NextResponse.json({ subscriptionId: rzpSub.id, shortUrl: (rzpSub as any).short_url, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (e: any) {
    console.error("autopay.enable", e?.message);
    return NextResponse.json({ error: "Could not enable auto-pay. Please try again." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = uid(req);
  if (!userId) return NextResponse.json({ error: "Sign in to manage auto-pay" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // authorization: the mandate must belong to a subscription the caller owns
  const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId: id }, select: { subscription: { select: { userId: true } } } });
  if (!ap || ap.subscription?.userId !== userId) return NextResponse.json({ error: "Auto-pay mandate not found" }, { status: 404 });

  try {
    await cancelSubscription(id, true);   // id = Razorpay subscription id (sub_xxx)
    await db.autopaySubscription.updateMany({ where: { gatewaySubId: id }, data: { status: "CANCELLED" } }).catch(() => {});
    return NextResponse.json({ cancelled: true });
  } catch (e: any) {
    console.error("autopay.cancel", e?.message);
    return NextResponse.json({ error: "Could not cancel auto-pay." }, { status: 502 });
  }
}
