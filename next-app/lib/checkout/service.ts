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
import { createOrder as createRzpOrder, razorpayConfigured, createPaymentLink } from "@/lib/razorpay";
import { applyWalletAtCheckout, creditTrialCashback, getWallet, reverseTxn } from "@/lib/wallet/service";
import { computeWalletApply } from "@/lib/wallet/engine";
import { validateCouponForCart, redeemCoupon } from "@/lib/coupons/service";
import { maybeAwardReferralForPaidOrder } from "@/lib/referrals/service";
import { earn } from "@/lib/loyalty/service";
import { notify, notifyOrderConfirmed } from "@/lib/notifications/dispatch";
import { audit } from "@/lib/auth/audit";
import { depositForCheckout, recordBottleUnavailability } from "@/lib/bottles/ownership";
import { assertDeliverableAddress } from "@/lib/addresses/deliverable";
import type { ReqContext } from "@/lib/auth/request";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

export interface CheckoutInput {
  variantId: string;
  planId?: string;
  bottles?: number;
  extraBottles?: number;                    // voluntary spare bottles beyond the plan requirement (deposit charged)
  unavailableBottles?: number;              // owned bottles the customer no longer has (lost/broken/kept) — replacement charged
  unavailableReason?: "lost" | "broken" | "kept" | "other";
  method?: "upi" | "card" | "netbanking" | "wallet" | "cod";  // instrument chosen in the Razorpay popup
  autopay?: boolean;                        // opt-in recurring mandate (subscription plans only)
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

/** Provenance for an order placed through a channel other than plain self-serve web.
 *  Purely additive — when omitted the order is a normal `website` customer order and
 *  behaviour is byte-identical. `actorId`/`actorRole` are the STAFF who placed an
 *  assisted order; they are only ever stored in plain string columns (Order.placedBy*,
 *  audit target) — never in a User-FK column (the actor id may be a dev-bridge id). */
export interface AssistContext {
  source?: "website" | "assisted" | "simple_mode";
  actorId?: string;
  actorRole?: string;
  consentAt?: Date;      // when the customer's verbal consent was recorded (assisted only)
}

export async function placeOrder(userId: string, input: CheckoutInput, ctx: ReqContext, assist?: AssistContext) {
  const source = assist?.source ?? "website";
  const isAssisted = source === "assisted";
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
  // Smart bottle deposit (held-aware): charge ONLY for newly-issued bottles — the shortfall
  // between what the plan needs and what the customer already holds, plus any voluntary
  // extras. Existing owners renewing pay ₹0; new customers / owners who returned everything
  // pay the mandatory deposit. Single per-bottle rate from bottle.deposit.config (charge +
  // refund unified). Never charges twice for a bottle the customer already owns.
  const dep = await depositForCheckout({ userId, requiredBottles: bottles, extraBottles: input.extraBottles, unavailableBottles: input.unavailableBottles, unavailableReason: input.unavailableReason ?? null });
  const depositPaise = dep.depositPaise;
  const isSubscriptionOrder = variant.type === "SUBSCRIPTION" || variant.type === "TRIAL";
  // quote() prices ONE bottle per delivery (dailyPaise × days) — it takes no quantity.
  // Scale the milk line by the bottles ordered, or a multi-bottle order is charged for a
  // single bottle while the subscription is created with qty: bottles, stock is decremented
  // by bottles, and renewal billing (billing/service.ts: Σ qty × dailyPaise) charges the
  // full amount from cycle 2 — i.e. only the first cycle leaked.
  const productPaise = q.totalPaise * bottles;
  const productDiscountPaise = q.discountPaise * bottles;
  const totalPaise = productPaise + depositPaise;
  // AutoPay is a recurring mandate — only for real subscription plans, strictly opt-in.
  // When on, coupon/wallet (one-time discounts) don't apply; the plan bills automatically.
  const wantsAutopay = !!input.autopay && !!plan && plan.days > 1 && variant.type === "SUBSCRIPTION";
  const subtotalPaise = productPaise + productDiscountPaise;
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
  // MANDATORY deliverable-address gate — owned + complete + serviceable + geocoded
  // + plausible (within the warehouse radius). An order/subscription can NEVER be
  // created without this. Coordinates are geocode-backfilled here; an unresolvable
  // or implausibly-far address is rejected (ask the customer to pin the location).
  const deliverable = await assertDeliverableAddress({ userId, addressId: input.address.id, label: "checkout", ctx });
  const addressId = deliverable.addressId;
  const pincode = deliverable.pincode;               // serviceability uses the SAVED pincode, not the client's

  /* ---- 3. coupon (server-validated) + wallet (server-capped) — NEVER trust the
       client's amounts. Coupon discounts the product only, not the refundable
       deposit; wallet then applies to the remaining amount. ---- */
  const couponCode = wantsAutopay ? "" : (input.couponCode ?? "").trim().toUpperCase();
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
  let requestedWalletPaise = wantsAutopay ? 0 : Math.max(0, Math.floor(input.walletAmountPaise ?? 0));
  if (input.method === "wallet") requestedWalletPaise = afterCouponPaise; // "pay by wallet" = use as much as it covers
  const walletAppliedPaise = computeWalletApply(walletBalancePaise, afterCouponPaise, requestedWalletPaise).appliedPaise;
  const payablePaise = afterCouponPaise - walletAppliedPaise;
  if (input.method === "wallet" && payablePaise > 0) {
    throw Errors.conflict("Your wallet balance isn't enough for this order — add money or pick another method.");
  }

  /* ---- serviceability + geocoding + plausibility already enforced above by
       assertDeliverableAddress (single source of truth for a deliverable address). ---- */

  /* ---- 3b. inventory — resolve the DB variant + block overselling filled-bottle
       stock. The check reads the SERVER stock (never trusts the client); the
       decrement itself happens once on payment (commitOrderStock). A variant that
       can't be resolved is treated as untracked → never blocks a sale. ---- */
  let stockVariantId: string | null = variant.dbVariantId ?? null;
  if (!stockVariantId) {
    const dbProduct = await db.product.findUnique({ where: { slug: variant.productSlug }, include: { variants: true } });
    stockVariantId = (dbProduct?.variants.find((v) => v.ml === variant.ml) ?? dbProduct?.variants[0])?.id ?? null;
  }
  if (stockVariantId) {
    const v = await db.variant.findUnique({ where: { id: stockVariantId }, select: { stock: true, reservedStock: true } });
    if (v) {
      const available = v.stock - v.reservedStock;
      if (bottles > available) {
        throw Errors.conflict(available > 0
          ? `Only ${available} ${variant.label} ${variant.productName} left in stock — please reduce the quantity.`
          : `${variant.label} ${variant.productName} is out of stock right now. Please check back soon.`);
      }
    }
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
        subtotalPaise, discountPaise: productDiscountPaise, depositPaise, taxPaise: 0, deliveryPaise: 0, totalPaise,
        couponCode: couponCode || null, couponDiscountPaise, walletAppliedPaise,
        status: "PENDING",
        // provenance/channel — default "website"; staff fields set only for assisted orders (plain strings, no FK)
        source, placedById: assist?.actorId ?? null, placedByRole: assist?.actorRole ?? null, assistConsentAt: assist?.consentAt ?? null,
        addressId, deliveryDate: startDate, deliverySlot: slot,   // delivery details → become a Delivery on payment
        // Reserve only NEWLY-ISSUED bottles (deposit-bearing) for a subscription — the customer's
        // existing bottles aren't re-reserved. Deliveries read SubscriptionItem.qty, so this
        // doesn't affect how many bottles are delivered. One-time orders keep the full count.
        stockVariantId, stockUnits: stockVariantId ? (isSubscriptionOrder ? dep.depositBottles : bottles) : 0,
        items: {
          create: [{
            productSlug: variant.productSlug, productName: variant.productName,
            variantLabel: variant.label,
            // TOTAL bottles on the order (bottles per delivery × delivery days) so the
            // invoice line reconciles: unitPrice × quantity == lineTotal. NB: this is an
            // order-level total — per-delivery bottles live on Delivery.bottleCount.
            quantity: days * bottles,
            unitPricePaise: Math.round(productPaise / Math.max(1, days * bottles)),
            lineTotalPaise: productPaise,
          }],
        },
      },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "CREATED", title: "Order placed", note: `${days}× ${variant.label} ${variant.productName}`.trim() } });

    // Real plans AND the trial pack become a live Subscription record (a short
    // "Trial Subscription" for the trial), so the FULL delivery schedule is
    // generated up front and it flows into deliveries / assignment / the
    // customer dashboard. The order type stays SAMPLE for a trial (preserves
    // trial reporting + the ₹200 cashback, which keys off the paid SAMPLE order).
    let subscriptionId: string | null = null;
    const isTrial = variant.type === "TRIAL";
    if (orderType === "SUBSCRIPTION" || isTrial) {
      // resolve the plan: the chosen plan, or a dedicated (non-customer-facing)
      // trial plan whose length = the trial's fixedDays.
      let subPlanId: string | null;
      let subDays: number;
      let subPlanName: string;
      if (isTrial) {
        subDays = Math.max(1, variant.fixedDays ?? days);
        const trialPlan = await tx.plan.upsert({
          where: { slug: "trial" },
          update: { days: subDays },
          create: { slug: "trial", name: "Trial Pack", days: subDays, discountBps: 0, badge: "Trial", autoRenew: false, active: false },
          select: { id: true, name: true },
        });
        subPlanId = trialPlan.id; subPlanName = trialPlan.name;
      } else {
        subPlanId = plan!.dbPlanId ?? (await tx.plan.findUnique({ where: { slug: plan!.slug }, select: { id: true } }))?.id ?? null;
        subDays = plan!.days; subPlanName = plan!.name;
      }
      let dbVariantId = variant.dbVariantId;
      if (!dbVariantId) {
        const dbProduct = await tx.product.findUnique({ where: { slug: variant.productSlug }, include: { variants: true } });
        dbVariantId = (dbProduct?.variants.find((v) => v.ml === variant.ml) ?? dbProduct?.variants[0])?.id ?? null;
      }
      if (subPlanId && dbVariantId) {
        const end = new Date(startDate); end.setDate(end.getDate() + subDays);
        const sub = await tx.subscription.create({
          data: {
            userId, planId: subPlanId, addressId, orderId: order.id, status: "ACTIVE",
            startDate, endDate: end, deliverySlot: slot, nextDeliveryAt: startDate,
            targetDeliveries: subDays,               // the paid delivery count; make-ups extend endDate, not this
            autoRenew: false,
            items: { create: [{ variantId: dbVariantId, qty: bottles }] },
          },
        });
        await tx.subscriptionEvent.create({
          data: { subscriptionId: sub.id, type: "CREATED", summary: `${isTrial ? "Trial started" : "Subscribed"} via checkout — ${subPlanName}, ${variant.label}${isAssisted ? ` (assisted by ${assist?.actorRole ?? "staff"})` : ""}`, byId: userId, byRole: "customer", ip: ctx.ip },
        });
        subscriptionId = sub.id;
      }
    }
    return { order, subscriptionId };
  }, TX);

  // Smart-deposit decision trail (Step 12): why this order was / wasn't charged a deposit.
  await audit({ userId, actorRole: "customer", action: "bottle.deposit.smart", target: `order ${order.id} · owned ${dep.ownedBottles} · reuse ${dep.reuseBottles} · replacement ${dep.replacementBottles} · new ${dep.depositBottles} · ₹${Math.round(dep.depositPaise / 100)} · ${dep.reason}`, ctx }).catch(() => {});
  // Step 3 — the customer declared they no longer have some owned bottles (lost/broken/kept):
  // write them off (held drops, so the replacement deposit charged above is justified) + audit.
  // Idempotent by orderId, so a checkout retry / re-place never double-writes.
  if (dep.unavailableBottles > 0 && dep.unavailableReason) {
    await recordBottleUnavailability({ userId, qty: dep.unavailableBottles, reason: dep.unavailableReason, orderId: order.id, subscriptionId, actorId: userId, actorRole: "customer" }).catch(() => {});
  }

  const base = { orderId: order.id, number: num(order.id), totalPaise, depositPaise, subscriptionId, type: orderType, couponDiscountPaise, walletAppliedPaise, payablePaise, source, bottleOwnership: { owned: dep.ownedBottles, newBottles: dep.depositBottles, reason: dep.reason } };

  // Assisted-order provenance trail (Part 5): who placed it for whom, with consent — the
  // authoritative audit record. userId stays the CUSTOMER (a real User FK); the staff actor
  // lives only in the target string (may be a dev-bridge id, never written to a FK column).
  if (isAssisted) {
    await audit({
      userId, actorRole: assist?.actorRole ?? "staff", action: "order.assisted.placed",
      target: `${base.number} · customer ${userId} · staff ${assist?.actorId ?? "?"} (${assist?.actorRole ?? "?"}) · consent ${assist?.consentAt ? assist.consentAt.toISOString() : "n/a"} · ₹${Math.round(totalPaise / 100)} · ${orderType}${couponCode ? ` · coupon ${couponCode}` : ""}${walletAppliedPaise > 0 ? ` · wallet ₹${Math.round(walletAppliedPaise / 100)}` : ""}`,
      ctx,
    }).catch(() => {});
  }

  /* ---- 4b. AUTOPAY — create the Razorpay recurring mandate for the plan and hand
       the client the subscription id to authorise in Checkout. Falls back cleanly
       to the normal one-time gateway when no Razorpay plan is mapped for this plan
       (RAZORPAY_PLAN_IDS unset) so checkout is never blocked. ---- */
  if (wantsAutopay && subscriptionId && plan) {
    try {
      const { enableAutopay } = await import("@/lib/autopay/service");
      const cyclesFor = variant.type === "SUBSCRIPTION" ? Math.min(120, Math.max(1, plan.days <= 7 ? 52 : plan.days <= 30 ? 24 : 12)) : 12;
      const mandate = await enableAutopay({ userId, subscriptionId, planSlug: plan.slug, variantId: input.variantId, totalCount: cyclesFor, amountPaise: q.totalPaise, ctx });
      await db.orderEvent.create({ data: { orderId: order.id, type: "NOTE", title: "AutoPay set up", note: `Recurring mandate ${mandate.gatewaySubId} — awaiting authorisation` } }).catch(() => {});
      await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} autopay`, ctx });
      return { ...base, paid: false, method: "autopay", autopay: { subscriptionId: mandate.gatewaySubId, keyId: mandate.keyId } };
    } catch (e) {
      // no plan mapped / gateway error → don't block the sale; fall through to one-time payment.
      console.error("checkout.autopay", (e as Error)?.message);
    }
  }

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
    // Auto-generate + email the B2C invoice now that the order is PAID (idempotent).
    try { const { ensureInvoiceForOrder } = await import("@/lib/orders/service"); await ensureInvoiceForOrder(order.id); } catch (e) { console.error("invoice.ensure", (e as Error)?.message); }
    // Order → Delivery bridge: create the delivery so it enters the assignment flow (idempotent).
    try { const { ensureDeliveryForOrder } = await import("@/lib/orders/delivery-bridge"); await ensureDeliveryForOrder(order.id); } catch (e) { console.error("delivery.ensure", (e as Error)?.message); }
    // Inventory: decrement the filled-bottle stock now that the order is PAID (idempotent).
    try { const { commitOrderStock } = await import("@/lib/inventory/order-stock"); await commitOrderStock(order.id); } catch (e) { console.error("stock.commit", (e as Error)?.message); }
    // Ops WhatsApp: tell the team an order landed (this path never reaches the gateway).
    try { const { notifyNewOrder } = await import("@/lib/ops/events"); await notifyNewOrder(order.id); } catch (e) { console.error("ops.newOrder", (e as Error)?.message); }
    return { ...base, paid: true, method: "wallet", cashback };
  }

  /* ---- 6a-assisted. An assisted order with a balance due settles via a Razorpay
       Payment Link (customer taps + pays, NO login) — sent on their channels. The order
       stays PENDING until the payment_link.paid webhook settles it (never marked paid
       early). Assisted orders never use an interactive gateway popup or COD. ---- */
  if (isAssisted && payablePaise > 0) {
    if (!razorpayConfigured()) {
      await releaseCheckoutHolds(order.id, "Payment gateway not configured", subscriptionId);
      throw new ApiError(503, "Online payments aren't configured — can't send a payment link.", "gateway_unconfigured");
    }
    try {
      const cust = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
      const link = await createPaymentLink({
        amountPaise: payablePaise,
        referenceId: base.number,
        description: `DOODLY order ${base.number}`,
        customer: { name: cust?.name ?? undefined, email: cust?.email ?? undefined, contact: cust?.phone ?? undefined },
        notify: { sms: !!cust?.phone, email: !!cust?.email },
        notes: { purpose: "assisted", orderId: order.id, userId },
      });
      const shortUrl = (link as { short_url: string }).short_url;
      const linkId = (link as { id: string }).id;
      await db.payment.create({ data: { userId, orderId: order.id, method: "UPI", amountPaise: payablePaise, status: "PENDING", razorpayLinkId: linkId } });
      await db.orderEvent.create({ data: { orderId: order.id, type: "NOTE", title: "Payment link sent", note: `Assisted order — awaiting payment via link${noteBits ? ` (${noteBits})` : ""}` } });
      await audit({ userId, actorRole: assist?.actorRole ?? "staff", action: "order.assisted.link", target: `${base.number} link ${linkId} ₹${payablePaise / 100}`, ctx }).catch(() => {});
      // Send the pay link to the customer (the URL is in the body → reaches email + in-app for sure).
      await notify(userId, {
        title: "Complete your DOODLY order 🥛",
        body: `Tap to pay ₹${(payablePaise / 100).toLocaleString("en-IN")} for order ${base.number}:\n${shortUrl}`,
        email: true, sms: true, whatsapp: true,
      }).catch(() => {});
      return { ...base, paid: false, method: "link", paymentLink: shortUrl, paymentLinkId: linkId };
    } catch (e) {
      console.error("checkout.assisted.link", (e as Error)?.message);
      await releaseCheckoutHolds(order.id, "Could not create payment link", subscriptionId);
      throw Errors.badRequest("Could not create the payment link. Please try again.");
    }
  }

  /* ---- 6b. cash on delivery (remaining due on delivery) ---- */
  if (input.method === "cod") {
    await db.payment.create({ data: { userId, orderId: order.id, method: "CASH", amountPaise: payablePaise, status: "PENDING" } });
    await db.orderEvent.create({ data: { orderId: order.id, type: "NOTE", title: "Cash on delivery", note: `Pay the delivery executive on arrival${noteBits ? ` (${noteBits})` : ""}` } });
    await audit({ userId, actorRole: "customer", action: "order.placed", target: `${base.number} cod ₹${payablePaise / 100}`, ctx });
    // COD order is confirmed at placement (pay on arrival) → confirm the customer (parity with prepaid).
    await notifyOrderConfirmed(userId, {
      number: base.number, amountPaise: totalPaise,
      firstDelivery: startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
    // COD is confirmed at placement (paid on arrival) → bridge it into the delivery flow now.
    try { const { ensureDeliveryForOrder } = await import("@/lib/orders/delivery-bridge"); await ensureDeliveryForOrder(order.id); } catch (e) { console.error("delivery.ensure", (e as Error)?.message); }
    // Inventory: decrement the filled-bottle stock (COD is confirmed at placement; idempotent).
    try { const { commitOrderStock } = await import("@/lib/inventory/order-stock"); await commitOrderStock(order.id); } catch (e) { console.error("stock.commit", (e as Error)?.message); }
    // Ops WhatsApp: COD is confirmed at placement, so the team needs to know now.
    try { const { notifyNewOrder } = await import("@/lib/ops/events"); await notifyNewOrder(order.id); } catch (e) { console.error("ops.newOrder", (e as Error)?.message); }
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
      data: { userId, orderId: order.id, method: GATEWAY_METHODS[input.method ?? "upi"] ?? "UPI", amountPaise: payablePaise, status: "PENDING", razorpayOrderId: rzp.id },
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
