/* =============================================================
   DOODLY — Daily milk settlement.
   For an IST delivery day: compute the litres actually sold (retail from
   Delivery rows via the same Variant.ml math the ops summary uses; B2B milk
   lines converted to litres), then draw that down from tanker inventory FIFO.
   Idempotent per day — re-settling reverses the day's draws and redoes them,
   so a changed delivery run reconciles cleanly.

   Retail "sold" = deliveries dated that day that were NOT cancelled/failed/
   skipped (the milk that went out). B2B milk in Litres is 1:1; in Bottles it
   is × the assumed bottle size (default 1 L, the same fallback retail uses).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { audit } from "@/lib/auth/audit";
import { consumeLitres, reverseByRef, type ConsumeResult } from "@/lib/milk/fifo";
import { getMilkConfig } from "@/lib/milk/config";
import { isMilkSlug, milkDrawLitres } from "@/lib/b2b/units";
import { getSolidsCogsConfig } from "@/lib/b2b/solids-config";

const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");
function parseMl(label?: string | null): number | null {
  const s = normLabel(label);
  let m = s.match(/^([\d.]+)ml$/); if (m) return Math.round(parseFloat(m[1]));
  m = s.match(/^([\d.]+)(?:l|ltr|litre|liter|litres|liters)$/); if (m) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}

// "Milk went out" = every delivery except FAILED/SKIPPED (DeliveryStatus has no
// CANCELLED — a cancelled subscription simply generates no delivery row).
/** Litres sold to retail on an IST day — mirrors lib/delivery/stats.ts exactly
 *  (Variant.ml × per-delivery bottles; a 500 ml order is 0.5 L, never 1 L). */
export async function retailLitresForDay(start: Date, end: Date): Promise<number> {
  const [rows, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { notIn: ["FAILED", "SKIPPED"] } },
      select: {
        bottleCount: true,
        subscription: { select: { items: { select: { qty: true, variant: { select: { ml: true } } } } } },
        order: { select: { items: { select: { productSlug: true, variantLabel: true } } } },
      },
      take: 5000,
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
  ]);
  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);
  const mlOfOrderItem = (slug: string, label: string | null) => mlByKey.get(`${slug}|${normLabel(label)}`) ?? parseMl(label) ?? 1000;

  let totalMl = 0;
  for (const r of rows) {
    const subItems = r.subscription?.items ?? [];
    if (subItems.length) { totalMl += subItems.reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0); continue; }
    const oi = (r.order?.items ?? [])[0];
    if (oi) { totalMl += mlOfOrderItem(oi.productSlug, oi.variantLabel) * (r.bottleCount || 1); continue; }
    totalMl += (r.bottleCount || 0) * 1000;
  }
  return totalMl / 1000;
}

/** Litres of raw milk sold to B2B on an IST day — unit-aware via lib/b2b/units:
 *  MILK (Litres 1:1, Bottles × size, KG → qty/density) always draws; SOLIDS draw
 *  their milk-equivalent (KG × per-slug yield) ONLY when the solids-COGS config is
 *  enabled with real yields, else they stay revenue-only (counted + logged). */
export async function b2bLitresForDay(start: Date, end: Date): Promise<number> {
  const [orders, cfg, solids] = await Promise.all([
    db.businessOrder.findMany({
      where: { deliveryDate: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      select: { items: { select: { productSlug: true, quantity: true, unit: true } } },
      take: 5000,
    }),
    getMilkConfig(),
    getSolidsCogsConfig(),
  ]);
  const solidYields = solids.enabled ? solids.yields : null;
  let litres = 0;
  let untrackedLines = 0;   // solid lines still not costed (config off, or a non-weight unit)
  for (const o of orders) {
    for (const it of o.items) {
      const draw = milkDrawLitres({ productSlug: it.productSlug, unit: it.unit, quantity: it.quantity }, { conversionFactor: cfg.conversionFactor, solidYields });
      litres += draw;
      if (!isMilkSlug(it.productSlug) && draw === 0) untrackedLines++;
    }
  }
  if (untrackedLines > 0) console.info(`[b2b-cogs] ${untrackedLines} solid B2B line(s) booked revenue but no COGS (${solids.enabled ? "non-weight unit — needs a pack weight" : "solids costing disabled"}).`);
  return litres;
}

export interface DaySettlement {
  date: string;
  retail: ConsumeResult;
  b2b: ConsumeResult;
  totalLitres: number;
  cogsPaise: number;
  shortfallLitres: number;
}

/** Settle one IST day: reverse any prior draws for the day, recompute sold
 *  litres, and consume them FIFO. Atomic. Returns the COGS + any shortfall. */
export async function settleDay(dateIso: string, actor?: { actorId?: string; actorRole?: string }): Promise<DaySettlement> {
  const { start, end, iso } = istDayWindow(dateIso);
  const [retailLitres, b2bLitres] = await Promise.all([retailLitresForDay(start, end), b2bLitresForDay(start, end)]);
  const refRetail = `settle:${iso}:RETAIL`;
  const refB2b = `settle:${iso}:B2B`;
  const day = start;   // attribute consumption to IST-midnight of that day

  const result = await db.$transaction(async (tx) => {
    await reverseByRef(tx, refRetail);
    await reverseByRef(tx, refB2b);
    const retail = await consumeLitres(tx, { date: day, channel: "RETAIL", litres: retailLitres, sourceRef: refRetail, note: `Retail sales ${iso}` });
    const b2b = await consumeLitres(tx, { date: day, channel: "B2B", litres: b2bLitres, sourceRef: refB2b, note: `B2B sales ${iso}` });
    return { retail, b2b };
  }, {
    // A re-settle does reverse + re-consume across several lots — many sequential
    // round-trips. Prisma's 5s default is too tight when the DB is a round-trip
    // away (it was fine in-region, but a latency spike must not abort mid-draw
    // and leave the day half-settled). Generous ceiling for an admin-cadence op.
    timeout: 30000, maxWait: 15000,
  });

  const settlement: DaySettlement = {
    date: iso,
    retail: result.retail,
    b2b: result.b2b,
    totalLitres: result.retail.allocatedLitres + result.b2b.allocatedLitres,
    cogsPaise: result.retail.costPaise + result.b2b.costPaise,
    shortfallLitres: result.retail.shortfallLitres + result.b2b.shortfallLitres,
  };
  await audit({
    userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system",
    action: "milk.settle",
    target: `${iso} · retail ${retailLitres.toFixed(1)}L · b2b ${b2bLitres.toFixed(1)}L · COGS ₹${(settlement.cogsPaise / 100).toFixed(2)}${settlement.shortfallLitres > 0.001 ? ` · SHORT ${settlement.shortfallLitres.toFixed(1)}L` : ""}`,
  }).catch(() => {});
  return settlement;
}
