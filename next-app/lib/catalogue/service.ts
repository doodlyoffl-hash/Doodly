/* =============================================================
   DOODLY — Catalogue service (DB-authoritative pricing).

   Boundary: config/catalogue.ts is the STRUCTURAL registry — it
   defines which variants/plans exist and their stable client ids
   (v300 / p30 …) and the productSlug↔ml↔type mapping. The DATABASE
   is authoritative for the mutable commercial fields: price, plan
   discount, bottle deposit, availability, stock. So an admin price
   edit in the Products module flows to BOTH the storefront display
   (publicCatalogue) and what the customer is charged
   (resolveCheckoutPricing) with no code change. If a DB row is
   missing we fall back to the config value so nothing ever breaks.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import {
  variants as cfgVariants,
  plans as cfgPlans,
  products as cfgProducts,
  bottleDepositPaise as cfgDeposit,
} from "@/config/catalogue";

const rupees = (paise: number) => Math.round(paise) / 100;
// A DB deposit of 0 means "not configured" — fall back to the platform default
// so the ₹120 glass-bottle deposit is never silently dropped.
const depositOf = (dbPaise: number | null | undefined) => (dbPaise && dbPaise > 0 ? dbPaise : cfgDeposit);

export interface CheckoutPricing {
  variant: {
    type: "TRIAL" | "SUBSCRIPTION";
    ml: number;
    dailyPaise?: number;
    fixedPaise?: number;
    fixedDays?: number;
    label: string;
    productSlug: string;
    productName: string;
    dbVariantId: string | null;
    active: boolean;
  };
  plan?: { days: number; discountBps: number; slug: string; name: string; dbPlanId: string | null };
  depositPaise: number;
}

/** Server-trusted pricing for checkout: prices come from the DB (admin-editable),
    keyed off the stable catalogue id, with config values as the safety net. */
export async function resolveCheckoutPricing(
  variantId: string,
  planSlug?: string,
): Promise<CheckoutPricing | null> {
  const cv = cfgVariants.find((v) => v.id === variantId);
  if (!cv) return null;
  const cp = planSlug ? cfgPlans.find((p) => p.slug === planSlug) : undefined;
  if (planSlug && !cp) return null;

  const dbProduct = await db.product.findUnique({
    where: { slug: cv.productSlug },
    include: { variants: true, pricing: true },
  });
  const dbVariant =
    dbProduct?.variants.find((v) => v.ml === cv.ml && v.type === cv.type) ??
    dbProduct?.variants.find((v) => v.ml === cv.ml) ??
    null;
  const dbPlan = cp ? await db.plan.findUnique({ where: { slug: cp.slug } }) : null;

  return {
    variant: {
      type: cv.type,
      ml: cv.ml,
      dailyPaise: dbVariant?.dailyPaise ?? cv.dailyPaise,
      fixedPaise: dbVariant?.fixedPaise ?? cv.fixedPaise,
      fixedDays: dbVariant?.fixedDays ?? cv.fixedDays,
      label: dbVariant?.label ?? cv.label,
      productSlug: cv.productSlug,
      productName: dbProduct?.name ?? cv.productSlug,
      dbVariantId: dbVariant?.id ?? null,
      active: dbVariant?.active ?? true,
    },
    plan: cp
      ? {
          days: dbPlan?.days ?? cp.days,
          discountBps: dbPlan?.discountBps ?? cp.discountBps,
          slug: cp.slug,
          name: dbPlan?.name ?? cp.name,
          dbPlanId: dbPlan?.id ?? null,
        }
      : undefined,
    depositPaise: depositOf(dbProduct?.pricing?.depositPaise),
  };
}

/** Storefront-shaped catalogue (rupees, lowercase status, discount fraction),
    keyed by the SAME ids as assets/js/data.js so the client can overlay it onto
    its presentational defaults. Commercial fields are DB-authoritative. */
export async function publicCatalogue() {
  const [dbProducts, dbPlans] = await Promise.all([
    db.product.findMany({ where: { deletedAt: null }, include: { variants: true, pricing: true } }),
    db.plan.findMany({}),
  ]);
  const bySlug = new Map(dbProducts.map((p) => [p.slug, p]));

  const products = cfgProducts.map((cp) => {
    const dp = bySlug.get(cp.slug);
    return {
      id: cp.slug,
      slug: cp.slug,
      name: dp?.name ?? cp.name,
      status: String(dp?.status ?? cp.status).toLowerCase(), // "available" | "coming_soon" | …
      visible: dp?.visible ?? true,
      featured: dp?.featured ?? false,
      imageUrl: dp?.imageUrl ?? null,
    };
  });

  const variants = cfgVariants.map((cv) => {
    const dp = bySlug.get(cv.productSlug);
    const dv =
      dp?.variants.find((v) => v.ml === cv.ml && v.type === cv.type) ??
      dp?.variants.find((v) => v.ml === cv.ml) ??
      null;
    const base = {
      id: cv.id,
      productId: cv.productSlug,
      ml: cv.ml,
      type: cv.type.toLowerCase(), // "trial" | "subscription"
      label: dv?.label ?? cv.label,
      active: dv?.active ?? true,
      stock: dv?.stock ?? null,
    };
    if (cv.type === "TRIAL") {
      return { ...base, fixedPrice: rupees(dv?.fixedPaise ?? cv.fixedPaise ?? 0), fixedDays: dv?.fixedDays ?? cv.fixedDays };
    }
    return { ...base, dailyPrice: rupees(dv?.dailyPaise ?? cv.dailyPaise ?? 0) };
  });

  const plans = cfgPlans.map((cpl) => {
    const dpl = dbPlans.find((p) => p.slug === cpl.slug);
    return {
      id: cpl.slug,
      slug: cpl.slug,
      name: dpl?.name ?? cpl.name,
      days: dpl?.days ?? cpl.days,
      discount: (dpl?.discountBps ?? cpl.discountBps) / 10000,
      tag: dpl?.badge ?? cpl.tag,
      active: dpl?.active ?? true,
    };
  });

  return { products, variants, plans, bottleDepositPaise: depositOf(bySlug.get("milk")?.pricing?.depositPaise) };
}
