/* =============================================================
   DOODLY — Order → Delivery bridge.
   When an order is CONFIRMED (prepaid PAID, or COD which is confirmed at
   placement and collected on arrival), create the Delivery so the order
   enters the assignment / route / driver flow. Idempotent + system-callable
   (payment webhook/verify + checkout). Never creates a delivery for an unpaid
   gateway order (no phantom deliveries) or a legacy order with no stored
   delivery details.

   - one-time / sample / extra order → a single Delivery linked to the order.
   - subscription order → the subscription's FIRST Delivery (linked to the
     subscription); recurring deliveries are generated separately.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export async function ensureDeliveryForOrder(orderId: string): Promise<{ deliveryId: string; created: boolean } | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, addressId: true, deliveryDate: true, deliverySlot: true,
      payment: { select: { method: true } },
      delivery: { select: { id: true } },
      subscription: { select: { id: true } },
    },
  });
  if (!order) return null;

  // Confirmed = prepaid (PAID) OR cash-on-delivery (collected on arrival).
  const confirmed = order.status === "PAID" || order.payment?.method === "CASH";
  if (!confirmed) return null;
  if (!order.deliveryDate || !order.addressId) return null;   // legacy order without stored details

  const bottleCount = 1;   // one delivery stop (capacity unit)

  // Subscription order → the subscription's first delivery (recurring ones generated elsewhere).
  if (order.subscription) {
    const existing = await db.delivery.findFirst({ where: { subscriptionId: order.subscription.id }, select: { id: true } });
    if (existing) return { deliveryId: existing.id, created: false };
    const d = await db.delivery.create({
      data: { subscriptionId: order.subscription.id, addressId: order.addressId, date: order.deliveryDate, slot: order.deliverySlot, status: "SCHEDULED", bottleCount },
    });
    return { deliveryId: d.id, created: true };
  }

  // One-time / sample / extra order → a single delivery linked to the order.
  if (order.delivery) return { deliveryId: order.delivery.id, created: false };
  const d = await db.delivery.create({
    data: { orderId: order.id, addressId: order.addressId, date: order.deliveryDate, slot: order.deliverySlot, status: "SCHEDULED", bottleCount },
  });
  return { deliveryId: d.id, created: true };
}
