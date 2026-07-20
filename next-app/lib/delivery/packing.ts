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
import type { PackingStatus } from "@prisma/client";

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
