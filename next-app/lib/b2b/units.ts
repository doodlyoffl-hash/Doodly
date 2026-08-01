/* =============================================================
   DOODLY — B2B unit conversion (the single KG / Litre / Bottle → litres rule).
   A B2B milk line can be priced/sold in Litres, Bottles or KG (per customer).
   Inventory + COGS are tracked in LITRES, so this is the ONE place that converts
   a sold quantity to the litres of raw milk it draws. KG uses the buffalo-milk
   density factor (MilkCostConfig.conversionFactor, litres = kg / factor) — the
   same factor the procurement side already uses. Non-milk (solids: paneer/ghee/
   kova/curd) draw no raw-milk inventory yet (milk-only COGS, a known gap). Pure
   — the caller passes the factor in, so it stays testable with no DB/I/O.
   ============================================================= */

export const ASSUMED_BOTTLE_ML = 1000;   // a B2B "Bottle" with no size → 1 L (matches the retail fallback in settle.ts)
export const DEFAULT_CONVERSION_FACTOR = 1.03;   // buffalo-milk kg→litre density (MilkCostConfig default)

/** Milk is the only product whose sales draw the tanker (raw-milk) inventory. */
export function isMilkSlug(slug?: string | null): boolean {
  return String(slug || "").toLowerCase() === "milk";
}

/** Is a unit a KG (weight) unit? */
export function isKgUnit(unit?: string | null): boolean {
  const u = String(unit || "").toLowerCase();
  return u.startsWith("kg") || u.startsWith("kilo");
}

/** Is a unit a litre (volume) unit? */
export function isLitreUnit(unit?: string | null): boolean {
  const u = String(unit || "").toLowerCase();
  return u.startsWith("litre") || u.startsWith("liter") || u === "l";
}

export interface SaleLine {
  productSlug?: string | null;
  unit?: string | null;
  quantity: number;
}

/**
 * Litres of raw MILK a single B2B line draws from tanker inventory.
 *  • Litres  → quantity (1:1)
 *  • Bottles → quantity × bottle size (1 L default)
 *  • KG      → quantity / conversionFactor   (buffalo-milk density)
 *  • non-milk product, or an unrecognised unit → 0 (never guessed)
 * `factor` = MilkCostConfig.conversionFactor (defaults to 1.03 if unset/invalid).
 */
export function saleLitres(line: SaleLine, factor: number = DEFAULT_CONVERSION_FACTOR): number {
  if (!isMilkSlug(line.productSlug)) return 0;
  const qty = Number(line.quantity) || 0;
  if (qty <= 0) return 0;
  if (isLitreUnit(line.unit)) return qty;
  const u = String(line.unit || "").toLowerCase();
  if (u.startsWith("bottle")) return (qty * ASSUMED_BOTTLE_ML) / 1000;
  if (isKgUnit(line.unit)) { const f = Number(factor) > 0 ? Number(factor) : DEFAULT_CONVERSION_FACTOR; return qty / f; }
  return 0;
}

/** Sum litres of raw milk drawn across many B2B lines. */
export function totalSaleLitres(lines: SaleLine[], factor: number = DEFAULT_CONVERSION_FACTOR): number {
  return (lines || []).reduce((s, l) => s + saleLitres(l, factor), 0);
}
