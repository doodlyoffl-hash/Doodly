/* =============================================================
   DOODLY — Delivery completion (single source of truth).
   Marks a stop DELIVERED and runs the FULL side-effect set, so the
   two executive entry points (POST /api/delivery/stop/[id] and
   PATCH /api/driver/deliveries/[id]) behave identically:
     • stamp DELIVERED + deliveredAt + bottles + cash + address snapshot
     • BottleLedger ISSUED (handed over) + RETURNED (empties collected)
     • loyalty: bottle-return points + 12-stop streak bonus
     • notify the customer (delivered) + a one-time review request
   Idempotent (a stop already DELIVERED is a no-op). All post-transaction
   side-effects are best-effort and never throw.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { notify, notifyDelivered } from "@/lib/notifications/dispatch";
import { earn } from "@/lib/loyalty/service";
import { moveBottleStockLenient } from "@/lib/bottles/service";

export interface CompleteDeliveryOpts {
  bottlesIn?: number;                 // empties collected (RETURNED)
  bottlesOut?: number;                // bottles handed over (ISSUED); defaults to bottleCount
  cashCollected?: number;             // COD collected, paise
  customerRemark?: string | null;
  execRemark?: string | null;         // the executive's own note on the outcome
  podPhotoUrl?: string | null;        // proof-of-delivery photo URL (when uploaded)
  status?: "DELIVERED" | "PARTIALLY_DELIVERED";   // PARTIALLY_DELIVERED when only some bottles were handed over
}

export async function completeDelivery(deliveryId: string, opts: CompleteDeliveryOpts = {}) {
  const del = await db.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true, status: true, bottleCount: true, addressId: true, subscriptionId: true, orderId: true,
      userId: true, kind: true,
      subscription: { select: { userId: true, addressId: true, items: { select: { qty: true, variant: { select: { ml: true } } } } } },
      order: { select: { userId: true } },
      pickupRequest: { select: { id: true } },
    },
  });
  if (!del) return null;
  if (del.status === "DELIVERED" || del.status === "PARTIALLY_DELIVERED") return { idempotent: true as const, delivery: { id: del.id, status: del.status } };
  const finalStatus = opts.status ?? "DELIVERED";

  // A PICKUP has no subscription/order — its customer is the direct Delivery.userId.
  const custId = del.subscription?.userId ?? del.order?.userId ?? del.userId ?? null;
  const bottlesIn = Math.max(0, opts.bottlesIn ?? 0);
  // A PICKUP hands over nothing (its bottleCount is empties-to-collect, not milk to issue).
  const bottlesOut = Math.max(0, opts.bottlesOut ?? (del.kind === "PICKUP" ? 0 : del.bottleCount ?? 0));
  // Pin the address actually delivered to (history snapshot) so a later address change can't rewrite it.
  const snapshotAddressId = del.addressId ?? del.subscription?.addressId ?? null;

  const delivery = await db.$transaction(async (tx) => {
    const d = await tx.delivery.update({
      where: { id: del.id },
      data: {
        status: finalStatus, deliveredAt: new Date(),
        bottlesIn, bottlesOut,
        ...(opts.cashCollected !== undefined ? { cashCollected: opts.cashCollected } : {}),
        customerRemark: opts.customerRemark ?? null,
        ...(opts.execRemark !== undefined ? { execRemark: opts.execRemark } : {}),
        ...(opts.podPhotoUrl ? { podPhotoUrl: opts.podPhotoUrl } : {}),
        addressId: snapshotAddressId,
      },
      select: { id: true, status: true, bottlesIn: true, bottlesOut: true, cashCollected: true, deliveredAt: true },
    });
    if (custId) {
      if (bottlesOut > 0) await tx.bottleLedger.create({ data: { userId: custId, deliveryId: del.id, event: "ISSUED", qty: bottlesOut } });
      if (bottlesIn > 0) await tx.bottleLedger.create({ data: { userId: custId, deliveryId: del.id, event: "RETURNED", qty: bottlesIn, note: "Collected by delivery executive" } });
    }
    return d;
  });

  // ---- fleet inventory auto-movement (best-effort, never blocks) ----
  // Handover moves stock AVAILABLE→IN_CIRCULATION; collected empties move
  // IN_CIRCULATION→CLEANING. Split by bottle size from the subscription items
  // (one-time orders default to 1000 ml). Washing (CLEANING→AVAILABLE) stays manual.
  try {
    const items = del.subscription?.items ?? [];
    const totalQty = items.reduce((s, it) => s + it.qty, 0);
    const sizes = items.length && totalQty > 0
      ? items.map((it) => ({ ml: it.variant?.ml ?? 1000, w: it.qty / totalQty }))
      : [{ ml: 1000, w: 1 }];
    const actor = { actorRole: "system", actorId: "delivery.complete" };
    const splitMove = async (total: number, from: "AVAILABLE" | "IN_CIRCULATION", to: "IN_CIRCULATION" | "CLEANING", reason: string) => {
      if (total <= 0) return;
      let assigned = 0;
      for (let i = 0; i < sizes.length; i++) {
        const q = i === sizes.length - 1 ? total - assigned : Math.round(total * sizes[i].w);
        assigned += q;
        await moveBottleStockLenient({ capacityMl: sizes[i].ml, from, to, qty: q, reason, note: `delivery ${del.id}` }, actor);
      }
    };
    await splitMove(bottlesOut, "AVAILABLE", "IN_CIRCULATION", "Delivery handover");
    await splitMove(bottlesIn, "IN_CIRCULATION", "CLEANING", "Empties collected");
  } catch { /* non-blocking */ }

  // ---- side-effects (best-effort, never block the completion) ----
  if (custId) {
    // Loyalty: bottle-return points + a bonus at every 12 consecutive DELIVERED stops.
    try {
      if (bottlesIn > 0) await earn.bottleReturn(custId, del.id, bottlesIn);
      if (del.subscriptionId) {
        const seq = await db.delivery.findMany({ where: { subscriptionId: del.subscriptionId }, orderBy: { date: "asc" }, select: { status: true } });
        let streak = 0;
        for (let i = seq.length - 1; i >= 0; i--) { if (seq[i].status === "DELIVERED") streak++; else break; }
        if (streak > 0 && streak % 12 === 0) await earn.deliveryStreak(custId, del.subscriptionId, streak / 12);
      }
    } catch { /* non-blocking */ }

    // Customer "delivered" notification.
    try { await notifyDelivered(custId, { bottles: bottlesIn }); } catch { /* non-blocking */ }

    // Review request — once, on the FIRST completed delivery of this order/subscription.
    try {
      const scope = del.subscriptionId ? { subscriptionId: del.subscriptionId } : del.orderId ? { orderId: del.orderId } : null;
      if (scope) {
        const deliveredCount = await db.delivery.count({ where: { ...scope, status: "DELIVERED" } });
        if (deliveredCount === 1) {
          await notify(custId, {
            title: "How was your milk? 🥛",
            body: "Your delivery is complete — rate it in a tap and help other families discover fresh A2 milk. Open My Orders to leave a quick review.",
            email: true, emailSubject: "Rate your DOODLY delivery 🥛",
          });
        }
      }
    } catch { /* non-blocking */ }
  }

  // Auto-complete a fixed-term (trial / non-renewing) subscription once its last
  // delivery is done — so a 3-day trial flips to COMPLETED after day 3. No-op for
  // auto-renewing plans.
  if (del.subscriptionId) {
    try { const { maybeCompleteSubscription } = await import("@/lib/subscriptions/deliveries"); await maybeCompleteSubscription(del.subscriptionId); } catch { /* non-blocking */ }
  }

  // Bottle-return pickup: advance the request (→ COLLECTED) and, per policy, auto-refund
  // the deposit to the wallet. Best-effort — never blocks the completion.
  if (del.kind === "PICKUP" && del.pickupRequest) {
    try { const { onPickupCollected } = await import("@/lib/bottles/pickup"); await onPickupCollected(del.pickupRequest.id, { bottlesCollected: bottlesIn }); } catch { /* non-blocking */ }
  }

  return { idempotent: false as const, delivery };
}

/* Non-handover outcomes an executive can record at the door (no bottles move):
     unavailable → CUSTOMER_UNAVAILABLE   reschedule → RESCHEDULED   cancel → CANCELLED
   A miss (unavailable / reschedule) is NOT a COUNTING status, so reconcileSchedule appends
   a make-up day and extends endDate — the customer keeps their paid day. CANCELLED COUNTS
   (the day is forfeited at the door), so no make-up. Detaches the stop from the route and
   re-optimises the executive's remaining run. Best-effort side-effects never throw. */
export interface DeliveryOutcomeOpts { execRemark?: string | null; actorId?: string; actorRole?: string }
const OUTCOME_STATUS = { unavailable: "CUSTOMER_UNAVAILABLE", reschedule: "RESCHEDULED", cancel: "CANCELLED" } as const;
export type DeliveryOutcome = keyof typeof OUTCOME_STATUS;

export async function setDeliveryOutcome(deliveryId: string, outcome: DeliveryOutcome, opts: DeliveryOutcomeOpts = {}) {
  const status = OUTCOME_STATUS[outcome];
  const del = await db.delivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, status: true, driverId: true, date: true, subscriptionId: true, subscription: { select: { userId: true } } },
  });
  if (!del) return null;
  const TERMINAL = ["DELIVERED", "PARTIALLY_DELIVERED", "CANCELLED"];
  if (TERMINAL.includes(del.status)) return { idempotent: true as const, status: del.status };

  const missedDriverId = del.driverId;   // capture before detach clears it
  const { detachAssignment, reconcileSchedule, reoptimizeAffected } = await import("@/lib/subscriptions/deliveries");
  await detachAssignment(del.id, del.driverId, opts.actorRole).catch(() => {});
  await db.delivery.update({
    where: { id: del.id },
    data: { status, execRemark: opts.execRemark ?? null, adjustReason: outcome.toUpperCase(), adjustNote: opts.execRemark ?? null },
  });

  // A miss (not counting) → make up the day. CANCELLED counts → no make-up.
  let reconcile: { created: number; endDate: Date | null } | null = null;
  if (del.subscriptionId && (outcome === "unavailable" || outcome === "reschedule")) {
    try {
      const rec = await reconcileSchedule(del.subscriptionId);
      reconcile = { created: rec.created, endDate: rec.endDate };
      await db.subscriptionEvent.create({ data: { subscriptionId: del.subscriptionId, type: "ADJUSTED", summary: `Stop ${outcome} at the door — schedule extended`, byId: opts.actorId ?? null, byRole: opts.actorRole ?? "delivery_executive" } }).catch(() => {});
      if (del.subscription?.userId) { const { notifyMissedDeliveryAdjusted } = await import("@/lib/notifications/dispatch"); await notifyMissedDeliveryAdjusted(del.subscription.userId, { newEndDate: rec.endDate }).catch(() => {}); }
    } catch { /* non-blocking */ }
  }
  await reoptimizeAffected([{ driverId: missedDriverId, date: del.date }]).catch(() => {});
  return { idempotent: false as const, status, reconcile };
}
