/* =============================================================
   DOODLY — Tanker Reconciliation (read-only re-derivation).

   The FIFO ledger (TankerConsumption) records draws per DAY × CHANNEL only, with
   no order/customer link. To answer "which customers/businesses consumed from
   tanker T", this module DETERMINISTICALLY re-derives the delivery→tanker mapping
   WITHOUT touching the settlement/P&L engine:

     • For each (day, channel) a tanker drew, the ledger already tells us exactly how
       that day's channel total split across lots (one TankerConsumption row per lot).
       Ordering lots FIFO (procurementDate asc) gives the tanker its cumulative litre
       slice [tStart, tEnd) of that day's total.
     • That day's deliveries / B2B orders (with per-row litres via the SAME math the
       engine uses) are laid end-to-end on the same [0, dayTotal) litre axis; the
       overlap of each row with [tStart, tEnd) is the litres that row drew from THIS
       tanker. Revenue is split pro-rata to the attributed litres.

   Reconciles by construction: Σ(attributed litres for tanker×channel) equals the
   ledger's TankerConsumption litres, and Σ(attributed cost) equals the tanker's
   realised COGS. Pure reads — safe to run any time; frozen into an immutable
   snapshot at close by tanker-report.ts.

   NB the per-row litres helpers below MIRROR lib/milk/settle.ts retailLitresForDay /
   b2bLitresForDay (same ml resolution + milkDrawLitres) — keep them in sync.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { getMilkConfig } from "@/lib/milk/config";
import { getSolidsCogsConfig } from "@/lib/b2b/solids-config";
import { milkDrawLitres, isMilkSlug } from "@/lib/b2b/units";

const EPS = 1e-6;
const IST = 5.5 * 3600e3;
const istISO = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");
function parseMl(label?: string | null): number | null {
  const s = normLabel(label);
  let m = s.match(/^([\d.]+)ml$/); if (m) return Math.round(parseFloat(m[1]));
  m = s.match(/^([\d.]+)(?:l|ltr|litre|liter|litres|liters)$/); if (m) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ReconLine {
  channel: "RETAIL" | "B2B";
  date: string;
  name: string;
  refId: string;              // userId (retail) or businessId (B2B)
  orderId: string | null;
  orderCode: string | null;
  subscriptionId: string | null;
  invoiceNumber: string | null;
  product: string;
  qty: string;
  unit: string;
  litres: number;             // attributed to THIS tanker
  sellingPricePaise: number;  // ₹/L for the line
  revenuePaise: number;       // attributed
  costPaise: number;          // attributed COGS (litres × tanker cost/L)
  exec: string | null;
}

/** A day's DELIVERED retail deliveries → per-delivery litres + refs + revenue.
 *  Mirrors settle.retailLitresForDay's ml math (Variant.ml × qty; a 500 ml order is 0.5 L). */
export async function retailDeliveryRows(start: Date, end: Date) {
  const [rows, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } },
      select: {
        id: true, date: true, bottleCount: true, revenuePaise: true, userId: true, orderId: true, subscriptionId: true,
        driver: { select: { user: { select: { name: true } } } },
        subscription: { select: { userId: true, items: { select: { qty: true, variant: { select: { ml: true, label: true } } } } } },
        order: { select: { userId: true, items: { select: { productSlug: true, variantLabel: true } } } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }], take: 8000,
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
  ]);
  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);
  const mlOfOrderItem = (slug: string, label: string | null) => mlByKey.get(`${slug}|${normLabel(label)}`) ?? parseMl(label) ?? 1000;

  const userIds = new Set<string>();
  const pre = rows.map((r) => {
    const uid = r.subscription?.userId ?? r.order?.userId ?? r.userId ?? null;
    if (uid) userIds.add(uid);
    let ml = 0, product = "";
    const subItems = r.subscription?.items ?? [];
    if (subItems.length) {
      ml = subItems.reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0);
      product = subItems.map((i) => `${i.qty}×${i.variant?.label ?? (i.variant?.ml ?? 1000) + "ml"}`).join(", ");
    } else {
      const oi = (r.order?.items ?? [])[0];
      if (oi) { ml = mlOfOrderItem(oi.productSlug, oi.variantLabel) * (r.bottleCount || 1); product = `${r.bottleCount || 1}×${oi.variantLabel ?? oi.productSlug}`; }
      else { ml = (r.bottleCount || 0) * 1000; product = `${r.bottleCount || 0} bottle(s)`; }
    }
    return { id: r.id, date: istISO(r.date), userId: uid, orderId: r.orderId, subscriptionId: r.subscriptionId, exec: r.driver?.user?.name ?? null, litres: ml / 1000, revenuePaise: r.revenuePaise ?? 0, product };
  });
  const users = userIds.size ? await db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }) : [];
  const uName = new Map(users.map((u) => [u.id, u.name ?? "—"]));
  return pre.map((r) => ({ ...r, name: r.userId ? (uName.get(r.userId) ?? "—") : "—" }));
}
export type RetailRow = Awaited<ReturnType<typeof retailDeliveryRows>>[number];

/** A day's DELIVERED B2B orders → per-order litres + refs + net revenue.
 *  Mirrors settle.b2bLitresForDay (milkDrawLitres per item). Attributed by deliveredAt day. */
export async function b2bOrderRows(start: Date, end: Date) {
  const [orders, cfg, solids] = await Promise.all([
    db.businessOrder.findMany({
      where: { revenuePaise: { not: null }, deliveredAt: { gte: start, lt: end } },
      select: { id: true, code: true, businessId: true, revenuePaise: true, deliveredAt: true, business: { select: { name: true } }, invoice: { select: { number: true } }, items: { select: { productSlug: true, productName: true, quantity: true, unit: true } } },
      orderBy: [{ deliveredAt: "asc" }, { id: "asc" }], take: 8000,
    }),
    getMilkConfig(),
    getSolidsCogsConfig(),
  ]);
  const solidYields = solids.enabled ? solids.yields : null;
  return orders.map((o) => {
    let litres = 0;
    for (const it of o.items) litres += milkDrawLitres({ productSlug: it.productSlug, unit: it.unit, quantity: it.quantity }, { conversionFactor: cfg.conversionFactor, solidYields });
    const milkItems = o.items.filter((i) => isMilkSlug(i.productSlug));
    const disp = (milkItems.length ? milkItems : o.items);
    return {
      id: o.id, code: o.code, date: istISO(o.deliveredAt as Date), businessId: o.businessId, name: o.business?.name ?? "—",
      invoiceNumber: o.invoice?.number ?? null, litres, revenuePaise: o.revenuePaise ?? 0,
      qty: disp.map((i) => `${i.quantity} ${i.unit}`).join(", "), unit: disp[0]?.unit ?? "", product: disp.map((i) => i.productName).join(", "),
    };
  });
}
export type B2bRow = Awaited<ReturnType<typeof b2bOrderRows>>[number];

/** Overlap length of row interval [rStart, rStart+rLen) with tanker slice [tStart, tEnd). */
const overlap = (rStart: number, rLen: number, tStart: number, tEnd: number) => Math.max(0, Math.min(rStart + rLen, tEnd) - Math.max(rStart, tStart));

export interface TankerRecon {
  tanker: { id: string; code: string; tankerNo: string; supplier: string; procurementDate: string; quantityKg: number; fatPct: number; litres: number; consumedLitres: number; remainingLitres: number; costPerLitrePaise: number; milkCostPaise: number; fatCostPaise: number; transportPaise: number; totalCostPaise: number; status: string; closedAt: string | null };
  retail: { customers: number; deliveries: number; litres: number; revenuePaise: number; lines: ReconLine[] };
  b2b: { businesses: number; deliveries: number; litres: number; revenuePaise: number; lines: ReconLine[] };
  usage: { openingLitres: number; retailLitres: number; b2bLitres: number; wastageLitres: number; carryForwardInLitres: number; carryForwardOutLitres: number; availableAfterCarryForward: number; carryForwardLitres: number; closingLitres: number };
  financial: { retailRevenuePaise: number; b2bRevenuePaise: number; totalRevenuePaise: number; procurementCostPaise: number; transportPaise: number; totalCostPaise: number; cogsPaise: number; grossProfitPaise: number; netProfitPaise: number };
  reconciled: boolean;
}

/** Carry-forward OUT (litres): the excess this tanker couldn't cover that is STILL waiting —
 *  it is the newest lot that drew on a currently-PENDING day, so that day's overflow will land
 *  on the next tanker to arrive. Computed LIVE (not frozen): once the next tanker absorbs the
 *  pending, the row clears and this returns 0 — even for a closed tanker's frozen report. */
export async function carryForwardOutForTanker(tankerId: string): Promise<number> {
  const pend = await db.milkPendingAllocation.findMany({ where: { status: "PENDING" }, select: { date: true, totalLitres: true } });
  let cfOut = 0;
  for (const pa of pend) {
    const dd = await db.tankerConsumption.findMany({ where: { date: pa.date, channel: { in: ["RETAIL", "B2B"] } }, select: { tankerId: true, tanker: { select: { procurementDate: true } } } });
    if (!dd.length) continue;
    const newest = dd.reduce((a, b) => (b.tanker.procurementDate.getTime() > a.tanker.procurementDate.getTime() ? b : a));
    if (newest.tankerId === tankerId) cfOut += pa.totalLitres;
  }
  return r2(cfOut);
}

/** Full reconciliation for one tanker — the exact customers/businesses/orders that consumed
 *  its milk, litres, revenue, cost, plus the milk-usage + financial summaries. */
export async function tankerReconciliation(tankerId: string): Promise<TankerRecon | null> {
  const t = await db.milkTanker.findUnique({ where: { id: tankerId } });
  if (!t) return null;

  // This tanker's draws, grouped by (day, channel).
  const myDraws = await db.tankerConsumption.groupBy({ by: ["date", "channel"], where: { tankerId }, _sum: { litres: true, costPaise: true } });
  const wastageLitres = myDraws.filter((d) => d.channel === "ADJUSTMENT").reduce((s, d) => s + (d._sum.litres ?? 0), 0);
  const active = myDraws.filter((d) => d.channel === "RETAIL" || d.channel === "B2B");

  const retailLines: ReconLine[] = [], b2bLines: ReconLine[] = [];
  if (active.length) {
    const days = active.map((d) => d.date);
    const rangeStart = new Date(Math.min(...days.map((d) => d.getTime())));
    const rangeEnd = new Date(Math.max(...days.map((d) => d.getTime())) + 24 * 3600e3);

    // ALL lots drawn in the range (every tanker), + this range's delivery/order rows — fetched once.
    const [allDraws, retailRows, b2bRows] = await Promise.all([
      db.tankerConsumption.findMany({ where: { date: { gte: rangeStart, lt: rangeEnd } }, select: { tankerId: true, date: true, channel: true, litres: true, tanker: { select: { procurementDate: true, createdAt: true, costPerLitrePaise: true } } } }),
      retailDeliveryRows(rangeStart, rangeEnd),
      b2bOrderRows(rangeStart, rangeEnd),
    ]);
    const retailByDay = new Map<string, RetailRow[]>(); for (const r of retailRows) (retailByDay.get(r.date) ?? retailByDay.set(r.date, []).get(r.date)!).push(r);
    const b2bByDay = new Map<string, B2bRow[]>(); for (const r of b2bRows) (b2bByDay.get(r.date) ?? b2bByDay.set(r.date, []).get(r.date)!).push(r);
    // lots bucketed by (dayIso, channel), FIFO-ordered
    const lotBucket = new Map<string, { tankerId: string; litres: number; costPerLitrePaise: number; pd: number; cd: number }[]>();
    for (const d of allDraws) { const k = `${istISO(d.date)}|${d.channel}`; (lotBucket.get(k) ?? lotBucket.set(k, []).get(k)!).push({ tankerId: d.tankerId, litres: d.litres, costPerLitrePaise: d.tanker.costPerLitrePaise, pd: d.tanker.procurementDate.getTime(), cd: d.tanker.createdAt.getTime() }); }
    for (const arr of lotBucket.values()) arr.sort((a, b) => (a.pd - b.pd) || (a.cd - b.cd));

    for (const draw of active) {
      const dayIso = istISO(draw.date), channel = draw.channel as "RETAIL" | "B2B";
      const lots = lotBucket.get(`${dayIso}|${channel}`) ?? [];
      let cum = 0, tStart = -1, tEnd = -1, costPerL = t.costPerLitrePaise;
      for (const lot of lots) { if (lot.tankerId === tankerId) { tStart = cum; tEnd = cum + lot.litres; costPerL = lot.costPerLitrePaise; } cum += lot.litres; }
      if (tStart < 0) continue;
      let rc = 0;
      if (channel === "RETAIL") {
        for (const r of (retailByDay.get(dayIso) ?? [])) {
          const attr = overlap(rc, r.litres, tStart, tEnd); rc += r.litres;
          if (attr <= EPS) continue;
          const frac = r.litres > 0 ? attr / r.litres : 0;
          retailLines.push({ channel, date: dayIso, name: r.name, refId: r.userId ?? "", orderId: r.orderId, orderCode: null, subscriptionId: r.subscriptionId, invoiceNumber: null, product: r.product, qty: r2(r.litres) + " L", unit: "L", litres: r2(attr), sellingPricePaise: r.litres > 0 ? Math.round(r.revenuePaise / r.litres) : 0, revenuePaise: Math.round(r.revenuePaise * frac), costPaise: Math.round(attr * costPerL), exec: r.exec });
        }
      } else {
        for (const r of (b2bByDay.get(dayIso) ?? [])) {
          const attr = overlap(rc, r.litres, tStart, tEnd); rc += r.litres;
          if (attr <= EPS) continue;
          const frac = r.litres > 0 ? attr / r.litres : 0;
          b2bLines.push({ channel, date: dayIso, name: r.name, refId: r.businessId, orderId: r.id, orderCode: r.code, subscriptionId: null, invoiceNumber: r.invoiceNumber, product: r.product, qty: r.qty, unit: r.unit, litres: r2(attr), sellingPricePaise: r.litres > 0 ? Math.round(r.revenuePaise / r.litres) : 0, revenuePaise: Math.round(r.revenuePaise * frac), costPaise: Math.round(attr * costPerL), exec: null });
        }
      }
    }
  }

  const sum = (a: ReconLine[], f: (l: ReconLine) => number) => a.reduce((s, l) => s + f(l), 0);
  const retailLitres = r2(sum(retailLines, (l) => l.litres)), b2bLitres = r2(sum(b2bLines, (l) => l.litres));
  const retailRev = sum(retailLines, (l) => l.revenuePaise), b2bRev = sum(b2bLines, (l) => l.revenuePaise);
  const cogsPaise = sum(retailLines, (l) => l.costPaise) + sum(b2bLines, (l) => l.costPaise);
  const totalRev = retailRev + b2bRev;
  const procurementCostPaise = t.milkCostPaise + t.fatCostPaise;

  // ledger truth for the reconciliation check
  const ledgerRetail = active.filter((d) => d.channel === "RETAIL").reduce((s, d) => s + (d._sum.litres ?? 0), 0);
  const ledgerB2b = active.filter((d) => d.channel === "B2B").reduce((s, d) => s + (d._sum.litres ?? 0), 0);
  const reconciled = Math.abs(retailLitres - ledgerRetail) < 0.5 && Math.abs(b2bLitres - ledgerB2b) < 0.5;

  // FIFO carry-forward: litres this tanker supplied for days BEFORE it arrived (= absorbed a
  // prior pending allocation) — its consumption dated earlier than its own procurement day.
  const procIso = istISO(t.procurementDate);
  const carryForwardInLitres = r2([...retailLines, ...b2bLines].filter((l) => l.date < procIso).reduce((s, l) => s + l.litres, 0));
  const carryForwardOutLitres = await carryForwardOutForTanker(tankerId);

  return {
    tanker: { id: t.id, code: t.code, tankerNo: t.tankerNo, supplier: t.supplier, procurementDate: istISO(t.procurementDate), quantityKg: t.quantityKg, fatPct: t.fatPct, litres: t.litres, consumedLitres: r2(t.consumedLitres), remainingLitres: r2(t.remainingLitres), costPerLitrePaise: t.costPerLitrePaise, milkCostPaise: t.milkCostPaise, fatCostPaise: t.fatCostPaise, transportPaise: t.transportPaise, totalCostPaise: t.totalCostPaise, status: t.status, closedAt: t.closedAt ? t.closedAt.toISOString() : null },
    retail: { customers: new Set(retailLines.map((l) => l.refId).filter(Boolean)).size, deliveries: retailLines.length, litres: retailLitres, revenuePaise: retailRev, lines: retailLines },
    b2b: { businesses: new Set(b2bLines.map((l) => l.refId).filter(Boolean)).size, deliveries: b2bLines.length, litres: b2bLitres, revenuePaise: b2bRev, lines: b2bLines },
    usage: { openingLitres: r2(t.litres), retailLitres, b2bLitres, wastageLitres: r2(wastageLitres), carryForwardInLitres, carryForwardOutLitres, availableAfterCarryForward: r2(t.litres - carryForwardInLitres), carryForwardLitres: t.status === "OPEN" ? r2(t.remainingLitres) : 0, closingLitres: r2(t.remainingLitres) },
    financial: { retailRevenuePaise: retailRev, b2bRevenuePaise: b2bRev, totalRevenuePaise: totalRev, procurementCostPaise, transportPaise: t.transportPaise, totalCostPaise: t.totalCostPaise, cogsPaise, grossProfitPaise: totalRev - cogsPaise, netProfitPaise: totalRev - cogsPaise },
    reconciled,
  };
}
