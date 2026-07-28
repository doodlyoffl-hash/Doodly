/* =============================================================
   DOODLY — Packing workflow (warehouse stage per delivery).
   Ops/admin advance a delivery through PENDING → PACKING → PACKED →
   READY (ready for dispatch), independent of the executive delivery
   status. Informational + operational: it does not gate auto-assignment.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { audit } from "@/lib/auth/audit";
import { istDayWindow } from "@/lib/delivery/stats";
import type { ReqContext } from "@/lib/auth/request";
import { DeliveryStatus, type PackingStatus } from "@prisma/client";

export const PACKING_STAGES: PackingStatus[] = ["PENDING", "PACKING", "PACKED", "READY"];
export const PACKING_LABEL: Record<PackingStatus, string> = {
  PENDING: "Pending", PACKING: "Packing started", PACKED: "Packed", READY: "Ready for dispatch",
};
const CLOSED = ["DELIVERED", "FAILED", "SKIPPED"] as const;

interface Actor { actorId?: string; actorRole?: string; ctx?: ReqContext }
const packedData = (status: PackingStatus, actor: Actor) =>
  status === "PACKED" || status === "READY" ? { packedAt: new Date(), packedById: actor.actorId ?? null } : {};

/** Advance ONE delivery's packing stage. */
export async function advancePacking(deliveryId: string, status: PackingStatus, actor: Actor) {
  const del = await db.delivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true } });
  if (!del) throw Errors.notFound("Delivery not found.");
  if ((CLOSED as readonly string[]).includes(del.status)) throw Errors.badRequest("This delivery is already completed — nothing to pack.");
  await db.delivery.update({ where: { id: deliveryId }, data: { packingStatus: status, ...packedData(status, actor) } });
  await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole ?? "system", action: `delivery.packing.${status.toLowerCase()}`, target: deliveryId, ctx: actor.ctx });
  await announcePackingIfDone([deliveryId], status);
  return { id: deliveryId, packingStatus: status };
}

/** Packing has no "day complete" event, so we detect the edge after each advance:
    once nothing is left PENDING/PACKING for that day, ops get the dispatch summary.
    Only worth checking when a stop actually reached a finished stage. */
async function announcePackingIfDone(ids: string[], status: PackingStatus) {
  if (status !== "PACKED" && status !== "READY") return;
  try {
    const { notifyPackingCompleteIfDone } = await import("@/lib/ops/events");
    await notifyPackingCompleteIfDone(ids);
  } catch { /* non-blocking — packing must never fail on an alert */ }
}

/** Advance MANY deliveries at once (skips already-completed ones). */
export async function bulkAdvancePacking(deliveryIds: string[], status: PackingStatus, actor: Actor) {
  const res = await db.delivery.updateMany({
    where: { id: { in: deliveryIds }, status: { notIn: [...CLOSED] } },
    data: { packingStatus: status, ...packedData(status, actor) },
  });
  await audit({ userId: actor.actorId ?? null, actorRole: actor.actorRole ?? "system", action: `delivery.packing.bulk.${status.toLowerCase()}`, target: `${res.count} deliveries`, ctx: actor.ctx });
  if (res.count > 0) await announcePackingIfDone(deliveryIds, status);
  return { updated: res.count, status };
}

/** Deliveries needing packing for a given IST day (default: today), with their
    stage, the items to pack + counts. `dateStr` = "YYYY-MM-DD" (IST). */
export async function packingBoard(dateStr?: string | null) {
  const { start, end, iso } = istDayWindow(dateStr);

  const rows = await db.delivery.findMany({
    where: { date: { gte: start, lt: end }, status: { notIn: [...CLOSED] } },
    orderBy: [{ packingStatus: "asc" }, { slot: "asc" }],
    take: 1000,
    select: {
      id: true, slot: true, packingStatus: true, status: true, bottleCount: true,
      address: { select: { area: true, city: true } },
      subscription: {
        select: {
          user: { select: { name: true } }, address: { select: { area: true, city: true } },
          items: { select: { qty: true, variant: { select: { label: true, product: { select: { name: true } } } } } },
        },
      },
      order: { select: { user: { select: { name: true } }, items: { select: { productName: true, variantLabel: true, quantity: true } } } },
    },
  });

  const items = rows.map((d) => {
    const isSub = !!d.subscription;
    const products = isSub
      ? (d.subscription?.items ?? []).map((i) => `${i.variant.product?.name ? i.variant.product.name + " " : ""}${i.variant.label} ×${i.qty}`.trim()).join(", ")
      : (d.order?.items ?? []).map((i) => `${i.productName}${i.variantLabel ? " " + i.variantLabel : ""} ×${i.quantity}`).join(", ");
    return {
      id: d.id,
      customer: d.subscription?.user?.name ?? d.order?.user?.name ?? "—",
      area: d.address?.area ?? d.address?.city ?? d.subscription?.address?.area ?? d.subscription?.address?.city ?? "—",
      slot: d.slot ?? "—",
      bottles: d.bottleCount,
      products: products || "—",
      packingStatus: d.packingStatus,
      deliveryStatus: d.status,
    };
  });
  const counts = items.reduce<Record<string, number>>((acc, i) => { acc[i.packingStatus] = (acc[i.packingStatus] ?? 0) + 1; return acc; }, {});
  return { date: iso, items, counts, total: items.length };
}

/* =============================================================
   Packing Summary BY BOTTLE SIZE (single source of truth)
   Groups every to-be-packed delivery for an IST day by BOTTLE SIZE
   (Variant.ml) → bottle counts + the customers behind each size. Reused by
   the Delivery-Management packing card, the packing-sheet export, the manifest
   and the 8 PM ops summary, so packing/inventory/dispatch read identical
   numbers. Bottle→size resolution MIRRORS lib/delivery/stats.ts (the "Milk
   required" KPI): subscription items carry qty (bottles/delivery) + Variant.ml;
   a one-time order resolves its variant label against the catalogue × the
   delivery's bottleCount — so the implied litres reconciles with Milk-required.
   Included: all deliveries for the date EXCEPT SKIPPED (customer cancelled that
   date) and FAILED (missed); a cancelled subscription deletes its future
   deliveries so it never appears. Grouping is purely by ml → new bottle sizes
   need no code change. ============================================================= */
const PACK_EXCLUDED: DeliveryStatus[] = [DeliveryStatus.SKIPPED, DeliveryStatus.FAILED];
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");
function parseMl(label?: string | null): number | null {
  const s = normLabel(label);
  let m = s.match(/^([\d.]+)ml$/);
  if (m) return Math.round(parseFloat(m[1]));
  m = s.match(/^([\d.]+)(?:l|ltr|litre|liter|litres|liters)$/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  return null;
}
/** Human label for a bottle size. ml is the grouping key (future sizes free). */
export const sizeLabel = (ml: number) => `${ml}ML`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PackingCustomerLine { customer: string; bottles: number; orderRef: string; route: string; executive: string; }
export interface PackingSize { ml: number; label: string; bottles: number; litres: number; customers: PackingCustomerLine[]; }
export interface PackingExportLine { customer: string; orderId: string; sizeLabel: string; ml: number; bottles: number; litres: number; route: string; executive: string; status: string; }
export interface PackingSummary {
  date: string;
  totals: { orders: number; customers: number; bottles: number; litres: number };
  sizes: PackingSize[];         // sorted by ml descending (1000, 500, 300…)
  lines: PackingExportLine[];   // flat, one per delivery×size — the packing sheet
}

export async function packingSummary(dateStr?: string | null): Promise<PackingSummary> {
  const { start, end, iso } = istDayWindow(dateStr);
  const [rows, variants] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { notIn: PACK_EXCLUDED } },
      select: {
        id: true, status: true, bottleCount: true,
        order: { select: { id: true, userId: true, user: { select: { name: true } }, items: { select: { productSlug: true, variantLabel: true } } } },
        subscription: { select: { id: true, userId: true, user: { select: { name: true } }, items: { select: { qty: true, variant: { select: { ml: true } } } } } },
        route: { select: { name: true, code: true } },
        driver: { select: { employeeId: true, user: { select: { name: true } } } },
      },
      orderBy: [{ slot: "asc" }, { sequence: "asc" }],
      take: 5000,
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
  ]);

  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);
  const mlOfOrderItem = (slug: string, label: string | null) =>
    mlByKey.get(`${slug}|${normLabel(label)}`) ?? parseMl(label) ?? 1000;

  const sizeMap = new Map<number, { bottles: number; cust: Map<string, PackingCustomerLine> }>();
  const lines: PackingExportLine[] = [];
  const customerIds = new Set<string>();

  const add = (ml: number, bottles: number, customer: string, orderRef: string, route: string, executive: string, status: string) => {
    if (!bottles || bottles <= 0) return;
    let sz = sizeMap.get(ml);
    if (!sz) { sz = { bottles: 0, cust: new Map() }; sizeMap.set(ml, sz); }
    sz.bottles += bottles;
    const existing = sz.cust.get(customer);
    if (existing) existing.bottles += bottles;
    else sz.cust.set(customer, { customer, bottles, orderRef, route, executive });
    lines.push({ customer, orderId: orderRef, sizeLabel: sizeLabel(ml), ml, bottles, litres: round2((ml * bottles) / 1000), route, executive, status });
  };

  for (const r of rows) {
    const route = r.route?.name || r.route?.code || "";
    const executive = r.driver ? (r.driver.user?.name || r.driver.employeeId || "") : "";
    const customer = r.subscription?.user?.name || r.order?.user?.name || "Customer";
    const uid = r.subscription?.userId || r.order?.userId;
    if (uid) customerIds.add(uid);
    const orderRef = r.order?.id
      ? r.order.id.slice(-6).toUpperCase()
      : r.subscription?.id ? "SUB-" + r.subscription.id.slice(-6).toUpperCase() : r.id.slice(-6).toUpperCase();

    const subItems = r.subscription?.items ?? [];
    if (subItems.length) {
      for (const it of subItems) add(it.variant?.ml ?? 1000, it.qty || 0, customer, orderRef, route, executive, r.status);
    } else {
      const oi = (r.order?.items ?? [])[0];
      const ml = oi ? mlOfOrderItem(oi.productSlug, oi.variantLabel) : 1000;
      add(ml, r.bottleCount || 0, customer, orderRef, route, executive, r.status);
    }
  }

  const sizes: PackingSize[] = [...sizeMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ml, s]) => ({
      ml, label: sizeLabel(ml), bottles: s.bottles, litres: round2((ml * s.bottles) / 1000),
      customers: [...s.cust.values()].sort((a, b) => b.bottles - a.bottles || a.customer.localeCompare(b.customer)),
    }));
  const bottles = sizes.reduce((a, s) => a + s.bottles, 0);
  const litres = round2(sizes.reduce((a, s) => a + s.ml * s.bottles, 0) / 1000);
  lines.sort((a, b) => b.ml - a.ml || a.customer.localeCompare(b.customer));

  return { date: iso, totals: { orders: rows.length, customers: customerIds.size, bottles, litres }, sizes, lines };
}

