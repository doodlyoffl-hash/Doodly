/* =============================================================
   DOODLY — Checkout service: real order placement from the storefront.

   Reuse-first: prices come from the SERVER-SIDE catalogue + quote()
   (the client never sends an amount), wallet payment reuses
   applyWalletAtCheckout (idempotent per order), gateway payment
   reuses lib/razorpay.createOrder and completes through the existing
   /api/payments/verify + webhook, cashback reuses creditTrialCashback,
   and coverage checks reuse the ServiceablePincode table. New here is
   only the orchestration: Order + items + events + Payment row +
   (for plans) the Subscription record.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, Errors } from "@/lib/http";
import { quote } from "@/lib/pricing";
import { resolveCheckoutPricing } from "@/lib/catalogue/service";
import { createOrder as createRzpOrder, razorpayConfigured } from "@/lib/razorpay";
import { applyWalletAtCheckout, creditTrialCashback, getWallet, reverseTxn } from "@/lib/wallet/service";
import { computeWalletApply } from "@/lib/wallet/engine";
import { validateCouponForCart, redeemCoupon } from "@/lib/coupons/service";
import { maybeAwardReferralForPaidOrder } from "@/lib/referrals/service";
import { earn } from "@/lib/loyalty/service";
import { notify, notifyOrderConfirmed } from "@/lib/notifications/dispatch";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

export interface CheckoutInput {
  variantId: string;
  planId?: string;
  bottles?: number;
  method: "upi" | "card" | "netbanking" | "wallet" | "cod";
  couponCode?: string;                      // optional coupon (validated + applied server-side)
  walletAmountPaise?: number;               // optional wallet amount to apply (capped server-side)
  startDate?: string;                       // ISO date for the first delivery
  slot?: string;                            // display slot, e.g. "6:00 AM – 8:00 AM"
  address: {
    id?: string;
    label?: string;
    line1?: string;
    city?: string;
    pincode?: string;
    contactName?: string;
    phone?: string;
  };
}

const GATEWAY_METHODS: Record<string, PaymentMethod> = { upi: "UPI", card: "CARD", netbanking: "NETBANKING" };

export async function placeOrder(userId: string, input: CheckoutInput, ctx: ReqContext) {
  /* ---- 1. server-trusted pricing — DB-authoritative (admin-editable) ---- */
  const pricing = await resolveCheckoutPricing(input.variantId, input.planId);
  if (!pricing) throw Errors.badRequest("Unknown product variant.");
  const { variant, plan } = pricing;
  if (variant.type === "SUBSCRIPTION" && !plan) throw Errors.badRequest("A plan is required for this bottle.");
  if (!variant.active) throw Errors.conflict(`${variant.label} ${variant.productName} isn't available right now.`);
  const bottles = Math.min(Math.max(input.bottles ?? 1, 1), 20);

  let q;
  try {
    q = quote(
      { type: variant.type, ml: variant.ml, dailyPaise: variant.dailyPaise, fixedPaise: variant.fixedPaise, fixedDays: variant.fixedDays },
      plan ? { days: plan.days, discountBps: plan.discountBps } : undefined,
    );
  } catch { throw Errors.badRequest("Could not price this selection."); }
  const depositPaise = variant.type === "SUBSCRIPTION" ? pricing.depositPaise * bottles : 0;
  const totalPaise = q.totalPaise + depositPaise;
  const subtotalPaise = q.totalPaise + q.discountPaise;
  if (totalPaise <= 0) throw Errors.badRequest("Invalid order amount.");
  const days = variant.type === "TRIAL" ? (variant.fixedDays ?? 1) : (plan?.days ?? 1);

  /* ---- 2. delivery address — MANDATORY + server-validated (release-blocker).
       An order can NEVER be placed without a valid delivery address. The customer
       must have SAVED a real address (via the shared address form → /api/addresses);
       checkout accepts ONLY its id and re-verifies ownership + completeness +
       serviceability from the DB row — the client's fields/pincode are never
       trusted (a manipulated request with no/foreign/incomplete address is
       rejected here, before any order or payment is created). ---- */
  if (!input.address || !input.address.id) {
    throw Errors.badRequest("Please add or select a valid delivery address before proceeding to payment.");
  }
  const addr = await db.address.findFirst({
    where: { id: input.address.id, userId },
    select: { id: true, line1: true, city: true, pincode: true },
  });
  if (!addr) throw Errors.forbidden("That delivery address isn't on your account — please choose one of your saved addresses.");
  if (!addr.line1 || !addr.city || !addr.pincode || !/^[1-9]\d{5}$/.test(addr.pincode)) {
    throw Errors.badRequest("Your delivery address is incomplete — please edit it and add the missing details before checkout.");
  }
  const addressId = addr.id;
  const pincode = addr.pincode;                      // serviceability uses the SAVED pincode, not the client's

  /* ---- 3. coupon (server-validated) + wallet (server-capped) — NEVER trust the
       client's amounts. Coupon discounts the product only, not the refundable
       deposit; wallet then applies to the remaining amount. ---- */
  const couponCode = (input.couponCode ?? "").trim().toUpperCase();
  let couponDiscountPaise = 0;
  if (couponCode) {
    const res = await validateCouponForCart(couponCode, {
      orderTotalPaise: q.totalPaise, userId,
      productSlugs: [variant.productSlug], planSlugs: plan ? [plan.slug] : [],
    });
    if (!res.ok) throw Errors.badRequest(res.message || "This coupon can't be applied to this order.");
    couponDiscountPaise = Math.max(0, Math.min(res.discountPaise, q.totalPaise));
  }
  const afterCouponPaise = totalPaise - couponDiscountPaise;

  const walletBalancePaise = (await db.user.findUnique({ where: { id: userId }, select: { walletPaise: true } }))?.walletPaise ?? 0;
  let requestedWalletPaise = Math.max(0, Math.floor(input.walletAmountPaise ?? 0));
  if (input.method === "wallet") requestedWalletPaise = afterCouponPaise; // "pay by wallet" = use as much as it covers
  const walletAppliedPaise = computeWalletApply(walletBalancePaise, afterCouponPaise, requestedWalletPaise).appliedPaise;
  const payablePaise = afterCouponPaise - walletAppliedPaise;
  if (input.method === "wallet" && payablePaise > 0) {
    throw Errors.conflict("Your wallet balance isn't enough for this order — add money or pick another method.");
  }

  /* ---- serviceable-pincode check against the saved address (when coverage set) ---- */
  const coverage = await db.serviceablePincode.count({ where: { enabled: true, deletedAt: null } });
  if (coverage > 0) {
    const pin = await db.serviceablePincode.findFirst({ where: { pincode, enabled: true, deletedAt: null } });
    if (!pin) throw Errors.conflict(`Sorry! DOODLY does not currently deliver to ${pincode}. Please choose a serviceable delivery address.`);
  }

  /* ---- 4. create the order (+ items, event, subscription for plans) ---- */
  const orderType = variant.type === "TRIAL" ? "SAMPLE" : (plan && plan.days > 1 ? "SUBSCRIPTION" : "ONE_TIME");
  const startDate = input.startDate ? new Date(input.startDate) : new Date(Date.now() + 86_400_000);
  if (isNaN(startDate.getTime())) throw Errors.badRequest("Invalid start date.");
  const slot = (input.slot ?? "06:00-08:00").slice(0, 40);

  const { order, subscriptionId } = await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId, type: orderType,
        subtotalPaise, discountPaise: q.discountPaise, depositPaise, taxPaise: 0, deliveryPaise: 0, totalPaise,
        couponCode: couponCode || null, couponDiscountPaise, walletAppliedPaise,
        status: "PENDING",
        items: {
          create: [{
            productSlug: variant.productSlug, productName: variant.productName,
            variantLabel: variant.label, quantity: days,
            unitPricePaise: Math.round(q.totalPaise / days), lineTotalPaise: q.totalPaise,
          }],
        },
      },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "CREATED", title: "Order placed", note: `${days}× ${variant.label} ${variant.productName}`.trim() } });

    // plans become a live Subscription record (address + slot + first delivery)
    let subscriptionId: string | null = null;
    if (orderType === "SUBSCRIPTION" && plan) {
      // the DB plan/variant ids were already resolved by resolveCheckoutPricing
      const dbPlanId = plan.dbPlanId ?? (await tx.plan.findUnique({ where: { slug: plan.slug }, select: { id: true } }))?.id ?? null;
      let dbVariantId = variant.dbVariantId;
      if (!dbVariantId) {
        const dbProduct = await tx.product.findUnique({ where: { slug: variant.productSlug }, include: { variants: true } });
        dbVariantId = (dbProduct?.variants.find((v) => v.ml === variant.ml) ?? dbProduct?.variants[0])?.id ?? null;
      }
      if (dbPlanId && dbVariantId) {
        const end = new Date(startDate); end.setDate(end.getDate() + plan.days);
        const sub = await tx.subscription.create({
          data: {
            userId, planId: dbPlanId, addressId, status: "ACTIVE",
            startDate, endDate: end, deliverySlot: slot, nextDeliveryAt: startDate,
            autoRenew: false,
            items: { create: [{ variantId: dbVariantId, qty: bottles }] },
          },
        });
        await tx.subscriptionEvent.create({
          data: { subscriptionId: sub.id, type: "CREATED", summary: `Subscribed via checkout — ${plan.name}, ${variant.label}`, byId: userId, byRole: "customer", ip: ctx.ip },
        });
        subscriptionId = sub.id;
      }
    }
    return { order, subscriptionId };
  }, TX);

  const base = { orderId: order.id, number: num(order.id), totalPaise, depositPaise, subscriptionId, type: orderType, couponDiscountPaise, walletAppliedPaise, payablePaise };
  const noteBits = [
    couponDiscountPaise > 0 ? `coupon −₹${(couponDiscountPaise / 100).toLocaleString("en-IN")}` : "",
    walletAppliedPaise > 0 ? `wallet −₹${(walletAppliedPaise / 100).toLocaleString("en-IN")}` : "",
  ].filter(Boolean).join(", ");

  /* ---- 5. lock the coupon + wallet against THIS order (idempotent per order;
       reversed by releaseCheckoutHolds on any failure). Locking before the
       gateway is what lets us charge exactly the remaining `payablePaise`. ---- */
  if (couponCode && couponDiscountPaise > 0) {
    try {
      await redeemCoupon(couponCode, { orderTotalPaise: q.totalPaise, userId, productSlugs: [variant.productSlug], planSlugs: plan ? [plan.slug] : [] }, order.id, { actorId: userId, actorRole: "customer" });
      // in-app confirmation of the saving (non-blocking; order confirmation covers channels)
      notify(userId, {
        title: `Coupon ${couponCode} applied ✓`,
        body: `You saved ₹${(couponDiscountPaise / 100).toLocaleString("en-IN")} on order ${base.number}.`,
      }).catch(() => {});
    } catch (e) {
      await failOrder(order.id, "Coupon could not be applied", subscriptionId);
      throw Errors.conflict((e as Error)?.message || "This coupon can no longer be applied.");
    }
  }
  if (walletAppliedPaise > 0) {
    const applied = await applyWalletAtCheckout({ userId, orderId: order.id, amountPaise: walletAppliedPaise, actorId: userId, actorRole: "customer" });
    if ((applied.appliedPaise ?? 0) < walletAppliedPaise) {          // balance dropped mid-checkout — undo everything
      await releaseCheckoutHolds(order.id, "Wallet balance changed", subscriptionId);
      throw Errors.conflict("Your wallet balance changed — please review and retry.");
    }
  }

  /* ---- 6a. fully covered by wallet (+ coupon) → confirm now, no gateway ---- */
  if (payablePaise <= 0) {
    await db.payment.create({ data: { userId, orderId: order.id, method: "WALLET", amountPaise: walletAppliedPaise, status: "PAID" } });
    await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    await db.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", title: "Order paid", note: `Paid in full${noteBits ? ` (${noteBits})` : ""}` } });
    let cashback = null;
    if (plan) { try { cashback = await creditTrialCashback({ userId, targetPlanSlug: plan.slug, actorId: userId }); } catch { /* non-blocking */ } }
    await maybeAwardReferralForPaidOrder(userId, { subscriptionId, orderId: order.id }, { actorId: userId, actorRole: "customer" });
    // DOODLY Pure Rewards: points on what the customer actually spent on product
    // (after coupon, excluding the refundable deposit) + subscription bonus. Idempotent.
    await earn.order(userId, order.id, Math.max(0, q.totalPaise - couponDiscountPaise));
    if (subscriptionId && plan) await earn.subscribe(userId, subscriptionId, plan.days);
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} wallet ₹${walletAppliedPaise / 100}${noteBits ? ` (${noteBits})` : ""}`, ctx });
    await notifyOrderConfirmed(userId, {   // in-app + email/SMS/WhatsApp (per opt-in + provider), non-blocking
      number: base.number, amountPaise: totalPaise,
      firstDelivery: startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
    return { ...base, paid: true, method: "wallet", cashback };
  }

  /* ---- 6b. cash on delivery (remaining due on delivery) ---- */
  if (input.method === "cod") {
    await db.payment.create({ data: { userId, orderId: order.id, method: "CASH", amountPaise: payablePaise, status: "PENDING" } });
    await db.orderEvent.create({ data: { orderId: order.id, type: "NOTE", title: "Cash on delivery", note: `Pay the delivery executive on arrival${noteBits ? ` (${noteBits})` : ""}` } });
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} cod ₹${payablePaise / 100}`, ctx });
    return { ...base, paid: false, method: "cod" };
  }

  /* ---- 6c. gateway (Razorpay) for the REMAINING payable — completed by verify + webhook ---- */
  if (!razorpayConfigured()) {
    await releaseCheckoutHolds(order.id, "Payment gateway not configured", subscriptionId);
    throw new ApiError(503, "Online payments aren't configured yet — use wallet or cash on delivery.", "gateway_unconfigured");
  }
  try {
    const rzp = await createRzpOrder(payablePaise, { receipt: base.number, notes: { purpose: "checkout", orderId: order.id, userId } });
    await db.payment.create({
      data: { userId, orderId: order.id, method: GATEWAY_METHODS[input.method] ?? "UPI", amountPaise: payablePaise, status: "PENDING", razorpayOrderId: rzp.id },
    });
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} ${input.method} ₹${payablePaise / 100}${noteBits ? ` (${noteBits})` : ""}`, ctx });
    return { ...base, paid: false, method: input.method, rzp: { orderId: rzp.id, amount: rzp.amount, currency: rzp.currency, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID } };
  } catch (e) {
    console.error("checkout.rzp", (e as Error)?.message);
    await releaseCheckoutHolds(order.id, "Could not start gateway payment", subscriptionId);
    throw Errors.badRequest("Could not start the payment. Please try again.");
  }
}

/** Mark an order cancelled when its payment could not begin, and release the
    subscription created alongside it (payment never started). */
async function failOrder(orderId: string, why: string, subscriptionId?: string | null) {
  await db.order.update({ where: { id: orderId }, data: { cancelledAt: new Date() } }).catch(() => {});
  await db.orderEvent.create({ data: { orderId, type: "CANCELLED", title: "Order not completed", note: why } }).catch(() => {});
  if (subscriptionId) {
    await db.subscriptionItem.deleteMany({ where: { subscriptionId } }).catch(() => {});
    await db.subscriptionEvent.deleteMany({ where: { subscriptionId } }).catch(() => {});
    await db.subscription.delete({ where: { id: subscriptionId } }).catch(() => {});
  }
}

/**
 * Reverse any coupon + wallet held against an order and fail it. Idempotent and
 * safe to call from every failure path (creation race, gateway-start failure,
 * client cancel, webhook payment.failed). Never reverses a PAID order.
 * Wallet is reversed via reverseTxn (which credits the balance BACK — not a bare
 * delete), the coupon redemption is removed and its usage counter decremented.
 */
export async function releaseCheckoutHolds(orderId: string, why: string, subscriptionId?: string | null) {
  const ord = await db.order.findUnique({ where: { id: orderId }, select: { status: true } }).catch(() => null);
  if (ord?.status === "PAID") return; // never claw back a completed order

  // 1. wallet — reverse the usage debit exactly once (credits the balance back)
  try {
    const usage = await db.walletTxn.findFirst({ where: { orderId, kind: "usage" }, select: { id: true } });
    if (usage) {
      const already = await db.walletTxn.findFirst({ where: { reversedTxnId: usage.id }, select: { id: true } });
      if (!already) await reverseTxn({ txnId: usage.id, actorRole: "system" });
    }
  } catch (e) { console.error("checkout.release.wallet", (e as Error)?.message); }

  // 2. coupon — remove the redemption + decrement its usage counter
  try {
    const red = await db.couponRedemption.findUnique({ where: { orderId }, select: { couponId: true } });
    if (red) {
      await db.$transaction([
        db.couponRedemption.delete({ where: { orderId } }),
        db.coupon.update({ where: { id: red.couponId }, data: { redeemed: { decrement: 1 } } }),
      ]);
    }
  } catch (e) { console.error("checkout.release.coupon", (e as Error)?.message); }

  await failOrder(orderId, why, subscriptionId);
}
