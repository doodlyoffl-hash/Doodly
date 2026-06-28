/* =============================================================
   B2B product catalogue — derived from the single catalogue source
   (config/catalogue.ts). Default *wholesale* unit prices (paise) are
   the prefill; admins override per order, and per-business pricing
   rules can be layered on later without code changes.
   ============================================================= */
import { products } from "@/config/catalogue";
import { PRODUCT_UNITS } from "./engine";

/** Default B2B price per *primary* unit (paise). Editable starting point. */
const B2B_DEFAULT_PRICE_PAISE: Record<string, number> = {
  milk: 6600,    // ₹66 / Litre
  curd: 12000,   // ₹120 / KG
  paneer: 40000, // ₹400 / KG
  kova: 36000,   // ₹360 / KG
  ghee: 110000,  // ₹1100 / KG
};

export interface B2BProduct {
  slug: string;
  name: string;
  units: string[];
  defaultPricePaise: number;
  primaryUnit: string;
}

export const B2B_PRODUCTS: B2BProduct[] = products.map((p) => ({
  slug: p.slug,
  name: p.name,
  units: PRODUCT_UNITS[p.slug] ?? ["Litres", "KG"],
  defaultPricePaise: B2B_DEFAULT_PRICE_PAISE[p.slug] ?? 0,
  primaryUnit: (PRODUCT_UNITS[p.slug] ?? ["Litres"])[0],
}));

export const b2bProductBySlug = (slug: string) => B2B_PRODUCTS.find((p) => p.slug === slug);
