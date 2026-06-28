/* =============================================================
   Live Order Status — service (Prisma, server-only). Resolves a
   customer's most relevant order / delivery / subscription into the
   banner payload. Backend-driven: admin order changes and delivery-
   executive status updates flow through here automatically (the
   banner polls this endpoint), so no manual frontend updates.
   Failure-tolerant: any error → inactive (banner simply hides).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import {
  mapDeliveryStatus, stageIndexOf, whenLabel, daysRemaining, etaFromSequence, isEnRoute,
  type LiveStatus,
} from "./engine";
import type { LiveStatusResponse, SubscriptionInfo, DeliveryInfo } from "./types";

// Operational DeliveryStatus values that mean "in flight right now".
const IN_PROGRESS = ["ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
const RECENT_DELIVERED_MS = 6 * 60 * 60 * 1000; // show the success state for 6h

const SLOT_PRETTY: Record<string, string> = {
  "06:00-08:00": "6:00 AM – 8:00 AM",
  "08:00-10:00": "8:00 AM – 10:00 AM",
};
const prettySlot = (slot?: string | null) => (slot ? SLOT_PRETTY[slot] ?? slot : null);

export async function getLiveStatus(userId: string | null): Promise<LiveStatusResponse> {
  if (!userId) return { active: false };
  try {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);

    const [deliveries, sub, order] = await Promise.all([
      db.delivery.findMany({
        where: { OR: [{ order: { userId } }, { subscription: { userId } }] },
        orderBy: { date: "asc" }, take: 60,
        include: { driver: { include: { user: { select: { name: true } } } } },
      }),
      db.subscription.findFirst({
        where: { userId, status: { in: ["ACTIVE", "PAUSED", "VACATION"] } },
        orderBy: { createdAt: "desc" },
        include: { items: { include: { variant: { include: { product: { select: { name: true } } } } }, take: 1 } },
      }),
      db.order.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { delivery: { select: { id: true } } } }),
    ]);

    // pick the most relevant delivery: in-flight → soonest upcoming → recently delivered
    const inFlight = deliveries.find((d) => IN_PROGRESS.includes(d.status));
    const upcoming = deliveries.find((d) => d.status === "SCHEDULED" && d.date >= startToday);
    const recentDelivered = deliveries
      .filter((d) => d.status === "DELIVERED" && (d.deliveredAt ?? d.date).getTime() >= now.getTime() - RECENT_DELIVERED_MS)
      .sort((a, b) => (b.deliveredAt ?? b.date).getTime() - (a.deliveredAt ?? a.date).getTime())[0];
    const current = inFlight ?? upcoming ?? recentDelivered ?? null;

    // derive the canonical status
    let status: LiveStatus;
    if (current) status = mapDeliveryStatus(current.status);
    else if (order && order.status === "PAID") status = "CONFIRMED";
    else if (order && order.status === "PENDING") status = "PENDING";
    else if (sub?.nextDeliveryAt) status = "SCHEDULED";
    else return { active: false };

    // subscription block
    let subscription: SubscriptionInfo | null = null;
    if (sub) {
      const item = sub.items[0];
      subscription = {
        productLabel: item?.variant.product.name ?? "A2 Buffalo Milk",
        sizeLabel: item?.variant.label ?? "",
        qty: item?.qty ?? 1,
        slot: prettySlot(sub.deliverySlot),
        nextDeliveryAt: sub.nextDeliveryAt ? sub.nextDeliveryAt.toISOString() : null,
        daysRemaining: daysRemaining(sub.endDate, now),
        status: sub.status,
        canPause: sub.status === "ACTIVE",
      };
    }

    // delivery block + ETA
    let delivery: DeliveryInfo | null = null;
    let eta: { minutes: number | null; arriving: boolean } | null = null;
    if (current) {
      delivery = {
        date: current.date.toISOString(),
        slot: prettySlot(current.slot) ?? subscription?.slot ?? null,
        rawStatus: current.status,
        driver: current.driver
          ? { name: current.driver.user.name, rating: current.driver.rating, vehicleNo: current.driver.vehicleNo }
          : null,
      };
      if (isEnRoute(status)) {
        eta = status === "NEAR_DESTINATION"
          ? { minutes: null, arriving: true }
          : { minutes: etaFromSequence(current.sequence) ?? null, arriving: false };
      }
    }

    const lastDeliveredRow = deliveries
      .filter((d) => d.status === "DELIVERED")
      .sort((a, b) => (b.deliveredAt ?? b.date).getTime() - (a.deliveredAt ?? a.date).getTime())[0];

    return {
      active: true,
      status,
      stageIndex: stageIndexOf(status),
      whenLabel: current ? whenLabel(current.date, now) : sub?.nextDeliveryAt ? whenLabel(sub.nextDeliveryAt, now) : null,
      eta,
      delivery,
      subscription,
      lastDelivered: lastDeliveredRow ? { date: (lastDeliveredRow.deliveredAt ?? lastDeliveredRow.date).toISOString() } : null,
      order: order ? { id: order.id, totalPaise: order.totalPaise } : null,
      updatedAt: now.toISOString(),
    };
  } catch (e) {
    console.error("order-status.getLiveStatus", (e as Error)?.message);
    return { active: false };
  }
}
