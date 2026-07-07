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
import { applyWalletAtCheckout, creditTrialCashback } from "@/lib/wallet/service";
import { maybeAwardReferralForPaidOrder } from "@/lib/referrals/service";
import { earn } from "@/lib/loyalty/service";
import { notifyOrderConfirmed } from "@/lib/notifications/dispatch";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

export interface CheckoutInput {
  variantId: string;
  planId?: string;
  bottles?: number;
  method: "upi" | "card" | "netbanking" | "wallet" | "cod";
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

  const base = { orderId: order.id, number: num(order.id), totalPaise, depositPaise, subscriptionId, type: orderType };

  /* ---- 5a. wallet payment — reuse the idempotent checkout debit ---- */
  if (input.method === "wallet") {
    const user = await db.user.findUnique({ where: { id: userId }, select: { walletPaise: true } });
    if ((user?.walletPaise ?? 0) < totalPaise) {
      await failOrder(order.id, "Insufficient wallet balance", subscriptionId);
      throw Errors.conflict("Your wallet balance isn't enough for this order — add money or pick another method.");
    }
    const applied = await applyWalletAtCheckout({ userId, orderId: order.id, amountPaise: totalPaise, actorId: userId, actorRole: "customer" });
    if ((applied.appliedPaise ?? 0) < totalPaise) {          // lost a race — roll the partial back
      await db.walletTxn.deleteMany({ where: { orderId: order.id, kind: "usage" } }).catch(() => {});
      await failOrder(order.id, "Wallet debit incomplete", subscriptionId);
      throw Errors.conflict("Your wallet balance changed — please retry.");
    }
    await db.payment.create({ data: { userId, orderId: order.id, method: "WALLET", amountPaise: totalPaise, status: "PAID" } });
    await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    await db.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", title: "Paid from wallet", note: `₹${(totalPaise / 100).toLocaleString("en-IN")} debited from your DOODLY Wallet` } });
    let cashback = null;
    if (plan) { try { cashback = await creditTrialCashback({ userId, targetPlanSlug: plan.slug, actorId: userId }); } catch { /* non-blocking */ } }
    // referral reward — if THIS buyer was referred and just paid for a qualifying (30-day+) plan (non-blocking)
    await maybeAwardReferralForPaidOrder(userId, { subscriptionId, orderId: order.id }, { actorId: userId, actorRole: "customer" });
    // DOODLY Pure Rewards: points on the paid order + subscription bonus (idempotent per order/subscription)
    await earn.order(userId, order.id, totalPaise);
    if (subscriptionId && plan) await earn.subscribe(userId, subscriptionId, plan.days);
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} wallet ₹${totalPaise / 100}`, ctx });
    await notifyOrderConfirmed(userId, { number: base.number });   // in-app + email/SMS/WhatsApp (per opt-in + provider), non-blocking
    return { ...base, paid: true, method: "wallet", cashback };
  }

  /* ---- 5b. cash on delivery ---- */
  if (input.method === "cod") {
    await db.payment.create({ data: { userId, orderId: order.id, method: "CASH", amountPaise: totalPaise, status: "PENDING" } });
    await db.orderEvent.create({ data: { orderId: order.id, type: "NOTE", title: "Cash on delivery", note: "Pay the delivery executive on arrival" } });
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} cod ₹${totalPaise / 100}`, ctx });
    return { ...base, paid: false, method: "cod" };
  }

  /* ---- 5c. gateway (Razorpay) — completed later by /api/payments/verify + webhook ---- */
  if (!razorpayConfigured()) {
    await failOrder(order.id, "Payment gateway not configured", subscriptionId);
    throw new ApiError(503, "Online payments aren't configured yet — use wallet or cash on delivery.", "gateway_unconfigured");
  }
  try {
    const rzp = await createRzpOrder(totalPaise, { receipt: base.number, notes: { purpose: "checkout", orderId: order.id, userId } });
    await db.payment.create({
      data: { userId, orderId: order.id, method: GATEWAY_METHODS[input.method] ?? "UPI", amountPaise: totalPaise, status: "PENDING", razorpayOrderId: rzp.id },
    });
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} ${input.method} ₹${totalPaise / 100}`, ctx });
    return { ...base, paid: false, method: input.method, rzp: { orderId: rzp.id, amount: rzp.amount, currency: rzp.currency, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID } };
  } catch (e) {
    console.error("checkout.rzp", (e as Error)?.message);
    await failOrder(order.id, "Could not start gateway payment", subscriptionId);
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
