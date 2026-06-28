/* =============================================================
   DOODLY — Subscription pricing engine (single source of truth)
   Ported verbatim from the static build's assets/js/builder.js.
   Money is integer PAISE end-to-end — never floats.
       Final = (dailyPaise × days) − discount
   ============================================================= */

export type VariantType = "TRIAL" | "SUBSCRIPTION";

export interface PriceVariant {
  type: VariantType;
  ml: number;
  dailyPaise?: number; // per-delivery price (subscription)
  fixedPaise?: number; // trial: total price (e.g. 20000 = ₹200)
  fixedDays?: number;  // trial: number of days
}

export interface PricePlan {
  days: number;
  discountBps: number; // basis points: 500 = 5%, 800 = 8%, 1000 = 10%
}

export interface Quote {
  days: number;
  originalPaise: number;
  discountPaise: number;
  totalPaise: number;
  savedPaise: number;
  isTrial: boolean;
}

export function quote(variant: PriceVariant, plan?: PricePlan): Quote {
  if (variant.type === "TRIAL") {
    const total = variant.fixedPaise ?? 0;
    return {
      days: variant.fixedDays ?? 0,
      originalPaise: total,
      discountPaise: 0,
      totalPaise: total,
      savedPaise: 0,
      isTrial: true,
    };
  }
  if (!plan) throw new Error("A plan is required for subscription variants");
  const original = (variant.dailyPaise ?? 0) * plan.days;
  const discount = Math.round((original * plan.discountBps) / 10000);
  return {
    days: plan.days,
    originalPaise: original,
    discountPaise: discount,
    totalPaise: original - discount,
    savedPaise: discount,
    isTrial: false,
  };
}

/** Format paise as Indian Rupees, e.g. 358800 -> "₹3,588" */
export const inr = (paise: number): string =>
  "₹" + Math.round(paise / 100).toLocaleString("en-IN");
