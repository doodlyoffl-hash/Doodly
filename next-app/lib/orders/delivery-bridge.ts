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

const IST_MS = 5.5 * 60 * 60 * 1000;
// Canonical morning slot key used across the app (seed, the auto-assign sweep). A
// delivery must carry a slot to be auto-assignable, so default to it when the order
// didn't capture one (older / minimal orders).
const DEFAULT_SLOT = "06:00-08:00";

/* The next delivery day at IST midnight (expressed as a UTC Date). Used when a
   confirmed order has no stored delivery date so it still lands on the board on
   the next serviceable morning instead of vanishing. */
function nextDeliveryDateIST(): Date {
  const nowIST = new Date(Date.now() + IST_MS);
  const y = nowIST.getUTCFullYear(), m = nowIST.getUTCMonth(), d = nowIST.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1) - IST_MS);   // tomorrow, IST midnight
}

/* A confirmed order must resolve to a delivery address. Prefer the address chosen
   at checkout; fall back to the customer's default (then any) saved address so a
   PAID order is never left without a delivery record. */
async function resolveAddressId(orderAddressId: string | null, userId: string): Promise<string | null> {
  if (orderAddressId) return orderAddressId;
  const fallback = await db.address.findFirst({
    where: { userId },
    orderBy: { isDefault: "desc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

export async function ensureDeliveryForOrder(orderId: string): Promise<{ deliveryId: string; created: boolean } | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, addressId: true, deliveryDate: true, deliverySlot: true, userId: true,
      payment: { select: { method: true } },
      delivery: { select: { id: true } },
      items: { select: { quantity: true } },
      subscription: { select: { id: true, addressId: true, items: { select: { qty: true } } } },
    },
  });
  if (!order) return null;

  // Confirmed = prepaid (PAID) OR cash-on-delivery (collected on arrival).
  const confirmed = order.status === "PAID" || order.payment?.method === "CASH";
  if (!confirmed) return null;

  // Physical bottles on this stop — drives the bottle ledger (ISSUED/RETURNED), the
  // executive's carrying capacity and the "total bottles" KPIs. Must be the real
  // quantity ordered, not one-per-stop. (Matches lib/subscriptions/deliveries.ts.)
  const bottleCount = order.subscription
    ? Math.max(1, (order.subscription.items ?? []).reduce((s, i) => s + (i.qty || 0), 0))
    : Math.max(1, (order.items ?? []).reduce((s, i) => s + (i.quantity || 0), 0));
  // Defensive fallbacks so a confirmed order never ends up without a delivery:
  // a date (its own, else the next delivery day) and an address (its own, else the
  // customer's saved default). Only skip when there is genuinely no address on file.
  const date = order.deliveryDate ?? nextDeliveryDateIST();

  // Subscription order → the subscription's first delivery (recurring ones generated elsewhere).
  if (order.subscription) {
    const existing = await db.delivery.findFirst({ where: { subscriptionId: order.subscription.id }, select: { id: true } });
    if (existing) return { deliveryId: existing.id, created: false };
    const addressId = await resolveAddressId(order.addressId ?? order.subscription.addressId, order.userId);
    if (!addressId) return null;
    const d = await db.delivery.create({
      data: { subscriptionId: order.subscription.id, addressId, date, slot: order.deliverySlot ?? DEFAULT_SLOT, status: "SCHEDULED", bottleCount },
    });
    return { deliveryId: d.id, created: true };
  }

  // One-time / sample / extra order → a single delivery linked to the order.
  if (order.delivery) return { deliveryId: order.delivery.id, created: false };
  const addressId = await resolveAddressId(order.addressId, order.userId);
  if (!addressId) return null;   // truly cannot deliver — no address anywhere on file
  const d = await db.delivery.create({
    data: { orderId: order.id, addressId, date, slot: order.deliverySlot ?? DEFAULT_SLOT, status: "SCHEDULED", bottleCount },
  });
  return { deliveryId: d.id, created: true };
}
