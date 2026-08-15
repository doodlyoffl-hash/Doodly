/* =============================================================
   DOODLY — Checkout PREVIEW (dry-run quote, NO writes).

   Mirrors the pricing/deposit/coupon/wallet/serviceability maths of
   placeOrder() (lib/checkout/service.ts) using the exact same pure
   functions, but creates NOTHING. It is the single source of truth for:
     • the assisted-order builder's live summary panel + confirm screen,
     • the customer/Simple-Mode order summary, and
     • test verification (so we can prove the economics without ever
       persisting a real order on the shared production database).

   Anything this returns must equal what placeOrder would charge for the
   same input — both call resolveCheckoutPricing/quote/depositForCheckout/
   validateCouponForCart/computeWalletApply, so they cannot disagree.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { quote } from "@/lib/pricing";
import { resolveCheckoutPricing } from "@/lib/catalogue/service";
import { computeWalletApply } from "@/lib/wallet/engine";
import { validateCouponForCart } from "@/lib/coupons/service";
import { depositForCheckout, type CheckoutDeposit, type UnavailableReason } from "@/lib/bottles/ownership";
import { checkServiceable } from "@/lib/addresses/serviceability";

export interface PreviewInput {
  variantId: string;
  planId?: string;                 // plan slug (matches CheckoutInput.planId usage)
  bottles?: number;
  extraBottles?: number;
  unavailableBottles?: number;
  unavailableReason?: UnavailableReason | null;
  couponCode?: string;
  walletAmountPaise?: number;      // amount to apply; capped to balance + payable
  addressId?: string;              // optional — when given, serviceability is checked
}

export interface CheckoutPreview {
  ok: boolean;
  needsPlan: boolean;              // a subscription bottle was chosen without a plan
  variant: { label: string; productName: string; ml: number; type: string };
  plan: { slug: string; name: string; days: number } | null;
  bottles: number;
  days: number;
  type: "SUBSCRIPTION" | "ONE_TIME" | "SAMPLE";
  product: { productPaise: number; productDiscountPaise: number; subtotalPaise: number };
  deposit: CheckoutDeposit;
  couponDiscountPaise: number;
  couponOk: boolean;
  couponMessage: string | null;
  walletBalancePaise: number;
  walletAppliedPaise: number;
  totalPaise: number;              // product + deposit (before coupon/wallet)
  afterCouponPaise: number;
  payablePaise: number;            // what still has to be paid (link/gateway) after wallet
  bottleOwnership: { owned: number; newBottles: number; reason: CheckoutDeposit["reason"] };
  serviceability: {
    checked: boolean;
    serviceable: boolean;
    complete: boolean;
    needsPin: boolean;
    pincode: string | null;
    reason?: string;
  };
}

/**
 * Compute the full order economics for `input` WITHOUT creating anything.
 * `userId` null ⇒ a not-yet-created customer (owned 0 bottles, ₹0 wallet, first order).
 */
export async function previewCheckout(userId: string | null, input: PreviewInput): Promise<CheckoutPreview> {
  // ---- 1. server-trusted pricing (same as placeOrder) ----
  const pricing = await resolveCheckoutPricing(input.variantId, input.planId);
  if (!pricing) throw Errors.badRequest("Unknown product variant.");
  const { variant, plan } = pricing;
  if (!variant.active) throw Errors.conflict(`${variant.label} ${variant.productName} isn't available right now.`);

  const bottles = Math.min(Math.max(input.bottles ?? 1, 1), 20);
  const days = variant.type === "TRIAL" ? (variant.fixedDays ?? 1) : (plan?.days ?? 1);
  const orderType: CheckoutPreview["type"] = variant.type === "TRIAL" ? "SAMPLE" : (plan && plan.days > 1 ? "SUBSCRIPTION" : "ONE_TIME");

  // Smart bottle deposit is pure — safe to run for a live preview.
  const deposit = await depositForCheckout({
    userId, requiredBottles: bottles, extraBottles: input.extraBottles,
    unavailableBottles: input.unavailableBottles, unavailableReason: input.unavailableReason ?? null,
  });

  // A subscription bottle needs a plan to be priced — surface it softly (the builder
  // shows "choose a plan" without an error toast). Everything else can still preview.
  if (variant.type === "SUBSCRIPTION" && !plan) {
    return {
      ok: false, needsPlan: true,
      variant: { label: variant.label, productName: variant.productName, ml: variant.ml, type: variant.type },
      plan: null, bottles, days, type: orderType,
      product: { productPaise: 0, productDiscountPaise: 0, subtotalPaise: 0 },
      deposit, couponDiscountPaise: 0, couponOk: true, couponMessage: null,
      walletBalancePaise: 0, walletAppliedPaise: 0, totalPaise: deposit.depositPaise,
      afterCouponPaise: deposit.depositPaise, payablePaise: deposit.depositPaise,
      bottleOwnership: { owned: deposit.ownedBottles, newBottles: deposit.depositBottles, reason: deposit.reason },
      serviceability: await previewServiceability(userId, input.addressId),
    };
  }

  let q;
  try {
    q = quote(
      { type: variant.type, ml: variant.ml, dailyPaise: variant.dailyPaise, fixedPaise: variant.fixedPaise, fixedDays: variant.fixedDays },
      plan ? { days: plan.days, discountBps: plan.discountBps } : undefined,
    );
  } catch { throw Errors.badRequest("Could not price this selection."); }

  // Same scaling as placeOrder: quote() prices ONE bottle/delivery → × bottles.
  const productPaise = q.totalPaise * bottles;
  const productDiscountPaise = q.discountPaise * bottles;
  const subtotalPaise = productPaise + productDiscountPaise;
  const totalPaise = productPaise + deposit.depositPaise;

  // ---- 2. coupon (validate only — never redeem) ----
  let couponDiscountPaise = 0;
  let couponOk = true;
  let couponMessage: string | null = null;
  const couponCode = (input.couponCode ?? "").trim().toUpperCase();
  if (couponCode) {
    const res = await validateCouponForCart(couponCode, {
      orderTotalPaise: q.totalPaise, userId: userId ?? undefined,
      productSlugs: [variant.productSlug], planSlugs: plan ? [plan.slug] : [],
    });
    couponOk = !!res.ok;
    couponMessage = res.message ?? null;
    if (res.ok) couponDiscountPaise = Math.max(0, Math.min(res.discountPaise, q.totalPaise));
  }
  const afterCouponPaise = totalPaise - couponDiscountPaise;

  // ---- 3. wallet (capped, no mutation) ----
  const walletBalancePaise = userId
    ? ((await db.user.findUnique({ where: { id: userId }, select: { walletPaise: true } }))?.walletPaise ?? 0)
    : 0;
  const requestedWalletPaise = Math.max(0, Math.floor(input.walletAmountPaise ?? 0));
  const walletAppliedPaise = computeWalletApply(walletBalancePaise, afterCouponPaise, requestedWalletPaise).appliedPaise;
  const payablePaise = afterCouponPaise - walletAppliedPaise;

  return {
    ok: true, needsPlan: false,
    variant: { label: variant.label, productName: variant.productName, ml: variant.ml, type: variant.type },
    plan: plan ? { slug: plan.slug, name: plan.name, days: plan.days } : null,
    bottles, days, type: orderType,
    product: { productPaise, productDiscountPaise, subtotalPaise },
    deposit, couponDiscountPaise, couponOk, couponMessage,
    walletBalancePaise, walletAppliedPaise, totalPaise, afterCouponPaise, payablePaise,
    bottleOwnership: { owned: deposit.ownedBottles, newBottles: deposit.depositBottles, reason: deposit.reason },
    serviceability: await previewServiceability(userId, input.addressId),
  };
}

/** Lightweight, write-free serviceability read for the preview panel. The real
 *  submit still goes through assertDeliverableAddress inside placeOrder, so
 *  enforcement is identical — this is only to show the staff/customer a live flag. */
async function previewServiceability(userId: string | null, addressId?: string): Promise<CheckoutPreview["serviceability"]> {
  if (!addressId || !userId) return { checked: false, serviceable: false, complete: false, needsPin: false, pincode: null };
  const addr = await db.address.findFirst({
    where: { id: addressId, userId },
    select: { line1: true, city: true, pincode: true, lat: true, lng: true },
  });
  if (!addr) return { checked: true, serviceable: false, complete: false, needsPin: false, pincode: null, reason: "not-found" };
  const complete = !!(addr.line1 && addr.city && addr.pincode);
  const needsPin = addr.lat == null || addr.lng == null;
  const svc = await checkServiceable(addr.pincode);
  return {
    checked: true, serviceable: svc.serviceable, complete, needsPin, pincode: addr.pincode ?? null,
    reason: svc.serviceable ? undefined : svc.reason,
  };
}
