/* =============================================================
   DOODLY mobile — catalogue (public, no auth).

   ⚠️ MIXED UNITS — read before touching pricing.
   GET /api/catalogue returns variant prices in RUPEES (`fixedPrice`,
   `dailyPrice`) but the bottle deposit in PAISE (`bottleDepositPaise`).
   That is the backend's existing contract (lib/catalogue/service.ts runs
   prices through rupees()), so the field NAMES carry the unit here and
   helpers convert once, at the edge. Everything downstream of
   toPaise() is paise, like the rest of DOODLY.

   Prices are DB-authoritative: config/catalogue.ts defines the structure,
   admin edits override the numbers. Never hardcode a price in the app.
   ============================================================= */
import { api } from "./client";

export interface CatalogueProduct {
  id: string;            // == slug
  slug: string;
  name: string;
  /** "available" | "coming_soon" | … (lowercased server-side) */
  status: string;
  visible: boolean;
  featured: boolean;
  imageUrl: string | null;
}

interface VariantBase {
  id: string;
  productId: string;     // product slug
  ml: number;
  label: string;
  active: boolean;
  /** null = not stock-tracked. 0 = genuinely out of stock. */
  stock: number | null;
}

export interface TrialVariant extends VariantBase {
  type: "trial";
  /** RUPEES — one-off price for the whole trial pack. */
  fixedPrice: number;
  fixedDays: number;
}

export interface SubscriptionVariant extends VariantBase {
  type: "subscription";
  /** RUPEES — price of ONE bottle, per delivery day. */
  dailyPrice: number;
}

export type CatalogueVariant = TrialVariant | SubscriptionVariant;

export interface CataloguePlan {
  id: string;
  slug: string;
  name: string;
  days: number;
  /** Fraction, not percent: 0.05 = 5% off. */
  discount: number;
  tag: string | null;
  active: boolean;
}

export interface Catalogue {
  products: CatalogueProduct[];
  variants: CatalogueVariant[];
  plans: CataloguePlan[];
  /** PAISE — note the unit difference from the variant prices above. */
  bottleDepositPaise: number;
}

export const isTrial = (v: CatalogueVariant): v is TrialVariant => v.type === "trial";

/** Rupees → paise, at the edge. Everything internal stays integer paise so
 *  no float ever reaches an order total. */
export const toPaise = (rupees: number): number => Math.round((Number(rupees) || 0) * 100);

/** A variant's price in PAISE. Trial packs are a one-off total; subscription
 *  variants are per bottle per day. */
export function variantPricePaise(v: CatalogueVariant): number {
  return isTrial(v) ? toPaise(v.fixedPrice) : toPaise(v.dailyPrice);
}

/** Buyable = active, in stock (or untracked) and its product is live. */
export function isBuyable(v: CatalogueVariant, product?: CatalogueProduct): boolean {
  if (!v.active) return false;
  if (v.stock !== null && v.stock <= 0) return false;
  if (product && (!product.visible || product.status !== "available")) return false;
  return true;
}

export async function getCatalogue(): Promise<Catalogue> {
  return api.get<Catalogue>("/api/catalogue", { anonymous: true });
}

/** Variants belonging to one product, cheapest first. */
export function variantsFor(cat: Catalogue, productSlug: string): CatalogueVariant[] {
  return cat.variants
    .filter((v) => v.productId === productSlug)
    .sort((a, b) => variantPricePaise(a) - variantPricePaise(b));
}
