/* =============================================================
   DOODLY Coupons — PURE promotion engine (no DB, no I/O).
   Validation + discount maths for the checkout + admin preview.
   The service layer resolves cart/customer facts and feeds them here.
   ============================================================= */

export type CouponDiscountType = "PERCENT" | "FLAT";
export type CouponEligibility = "ALL" | "FIRST_ORDER" | "SPECIFIC";

export interface CouponRule {
  code: string;
  discountType: CouponDiscountType;
  discountBps?: number | null;
  flatPaise?: number | null;
  maxDiscountPaise?: number | null;
  minOrderPaise: number;
  firstOrderOnly: boolean;
  eligibility: CouponEligibility;
  eligibleUserIds: string[];
  applicableProductSlugs: string[];
  applicableCategorySlugs: string[];
  applicablePlanSlugs: string[];
  perCustomerLimit?: number | null;
  maxRedemptions?: number | null;
  redeemed: number;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
  active: boolean;
  deletedAt?: Date | string | null;
}

export interface CartContext {
  orderTotalPaise: number;
  userId?: string | null;
  isFirstOrder?: boolean;
  productSlugs?: string[];
  categorySlugs?: string[];
  planSlugs?: string[];
  userRedemptions?: number;   // how many times THIS customer already used it
  now?: Date;
}

export type CouponReason =
  | "ok" | "inactive" | "deleted" | "not_started" | "expired" | "min_order"
  | "first_order_only" | "not_eligible_customer" | "max_redemptions" | "per_customer_limit"
  | "product_not_eligible" | "category_not_eligible" | "plan_not_eligible" | "no_discount";

export interface CouponDecision { ok: boolean; reason: CouponReason; discountPaise: number; message?: string }

const asDate = (d?: Date | string | null) => (d ? new Date(d) : null);
const overlaps = (a: string[], b?: string[]) => !!b && a.some((x) => b.includes(x));

/** Compute the discount for a % or flat coupon on an order total (integer paise). Never exceeds the total. */
export function computeDiscount(rule: CouponRule, orderTotalPaise: number): number {
  const total = Math.max(0, Math.floor(orderTotalPaise || 0));
  let d = 0;
  if (rule.discountType === "PERCENT") {
    d = Math.floor((total * (rule.discountBps ?? 0)) / 10000);
    if (rule.maxDiscountPaise != null) d = Math.min(d, rule.maxDiscountPaise);
  } else {
    d = rule.flatPaise ?? 0;
  }
  return Math.max(0, Math.min(d, total));
}

const MESSAGES: Record<CouponReason, string> = {
  ok: "Coupon applied.",
  inactive: "This coupon is not active.",
  deleted: "This coupon no longer exists.",
  not_started: "This coupon is not yet active.",
  expired: "This coupon has expired.",
  min_order: "Your order does not meet the minimum value for this coupon.",
  first_order_only: "This coupon is valid on your first order only.",
  not_eligible_customer: "This coupon is not available for your account.",
  max_redemptions: "This coupon has reached its usage limit.",
  per_customer_limit: "You have already used this coupon the maximum number of times.",
  product_not_eligible: "This coupon does not apply to the items in your cart.",
  category_not_eligible: "This coupon does not apply to the items in your cart.",
  plan_not_eligible: "This coupon does not apply to the selected plan.",
  no_discount: "This coupon gives no discount on this order.",
};

const deny = (reason: CouponReason): CouponDecision => ({ ok: false, reason, discountPaise: 0, message: MESSAGES[reason] });

/** Validate a coupon against a cart/customer context and return the discount if valid. */
export function validateCoupon(rule: CouponRule, cart: CartContext): CouponDecision {
  const now = cart.now ?? new Date();
  if (rule.deletedAt) return deny("deleted");
  if (!rule.active) return deny("inactive");
  const startsAt = asDate(rule.startsAt); if (startsAt && startsAt > now) return deny("not_started");
  const expiresAt = asDate(rule.expiresAt); if (expiresAt && expiresAt <= now) return deny("expired");
  if (cart.orderTotalPaise < (rule.minOrderPaise ?? 0)) return deny("min_order");
  if (rule.firstOrderOnly && cart.isFirstOrder === false) return deny("first_order_only");
  if (rule.eligibility === "SPECIFIC") {
    if (!cart.userId || !rule.eligibleUserIds.includes(cart.userId)) return deny("not_eligible_customer");
  }
  if (rule.maxRedemptions != null && rule.redeemed >= rule.maxRedemptions) return deny("max_redemptions");
  if (rule.perCustomerLimit != null && (cart.userRedemptions ?? 0) >= rule.perCustomerLimit) return deny("per_customer_limit");
  if (rule.applicableProductSlugs.length && !overlaps(rule.applicableProductSlugs, cart.productSlugs)) return deny("product_not_eligible");
  if (rule.applicableCategorySlugs.length && !overlaps(rule.applicableCategorySlugs, cart.categorySlugs)) return deny("category_not_eligible");
  if (rule.applicablePlanSlugs.length && !overlaps(rule.applicablePlanSlugs, cart.planSlugs)) return deny("plan_not_eligible");

  const discountPaise = computeDiscount(rule, cart.orderTotalPaise);
  if (discountPaise <= 0) return deny("no_discount");
  return { ok: true, reason: "ok", discountPaise, message: MESSAGES.ok };
}

/** Derived display status for the admin list. */
export function couponStatus(rule: Pick<CouponRule, "active" | "startsAt" | "expiresAt"> & { deletedAt?: Date | string | null }, now = new Date()): "Deleted" | "Inactive" | "Scheduled" | "Expired" | "Active" {
  if (rule.deletedAt) return "Deleted";
  if (!rule.active) return "Inactive";
  const s = asDate(rule.startsAt); if (s && s > now) return "Scheduled";
  const e = asDate(rule.expiresAt); if (e && e <= now) return "Expired";
  return "Active";
}
