/* =============================================================
   DOODLY — Bottle-return pickup + deposit-refund workflow.
   Customer-initiated after a subscription ends: the customer requests a final
   pickup, ops schedule it (materialising a kind=PICKUP Delivery so it reuses the
   whole delivery/assignment/exec stack), the executive collects the empties via
   the normal completeDelivery path, and the refundable deposit auto-credits to
   the DOODLY Wallet — idempotently, capped at the money actually held.
   Reuses lib/bottles/balance (customerHeld), lib/bottles/deposit, lib/wallet
   (refundBottleDeposit), and completeDelivery's RETURNED ledger + fleet move.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { audit } from "@/lib/auth/audit";
import type { ReqContext } from "@/lib/auth/request";
import type { BottlePickupStatus } from "@prisma/client";
import { customerHeld } from "@/lib/bottles/balance";
import { depositPerBottlePaise, refundableFor } from "@/lib/bottles/deposit";
import { getBottleDepositConfig } from "@/lib/bottles/deposit-config";
import { refundBottleDeposit } from "@/lib/wallet/service";
import { istDayWindow } from "@/lib/delivery/stats";
import { log } from "@/lib/logger";

/** A request is "active" (blocks a second one) until it is refunded/closed/cancelled. */
const ACTIVE: BottlePickupStatus[] = ["REQUESTED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COLLECTED", "VERIFIED"];

export interface PickupActor { userId?: string | null; role?: string | null; ctx?: ReqContext }
const act = (a?: PickupActor) => ({ actorId: a?.userId ?? undefined, actorRole: a?.role ?? undefined });

/** Customer raises a final bottle-return + deposit-refund request. */
export async function createPickupRequest(input: {
  userId: string; addressId?: string | null; subscriptionId?: string | null;
  preferredDate?: Date | null; preferredSlot?: string | null; note?: string | null; ctx?: ReqContext;
}) {
  const cfg = await getBottleDepositConfig();
  if (!cfg.enabled) throw Errors.badRequest("Bottle-return pickups are currently unavailable.");

  const { held } = await customerHeld(input.userId);
  if (held <= 0) throw Errors.badRequest("You have no bottles to return.");

  const existing = await db.bottlePickupRequest.findFirst({ where: { userId: input.userId, status: { in: ACTIVE } }, select: { id: true } });
  if (existing) throw Errors.conflict("You already have a bottle-return request in progress.");

  const addressId = input.addressId
    ?? (await db.address.findFirst({ where: { userId: input.userId, isDefault: true }, select: { id: true } }))?.id
    ?? (await db.address.findFirst({ where: { userId: input.userId }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id
    ?? null;

  const perBottle = await depositPerBottlePaise();
  const refundable = await refundableFor(input.userId, held);
  const req = await db.bottlePickupRequest.create({
    data: {
      userId: input.userId, addressId, subscriptionId: input.subscriptionId ?? null,
      status: "REQUESTED", bottlesExpected: held, depositPerBottlePaise: perBottle, refundableDepositPaise: refundable,
      preferredDate: input.preferredDate ?? null, preferredSlot: input.preferredSlot ?? null, customerNote: input.note ?? null,
    },
    select: { id: true, bottlesExpected: true, refundableDepositPaise: true, status: true },
  });
  await audit({ userId: input.userId, actorRole: "customer", action: "pickup.request.created", target: `${req.id} · ${held} bottle(s) · refundable ₹${Math.round(refundable / 100)}`, ctx: input.ctx }).catch(() => {});
  return req;
}

async function loadOpen(id: string) {
  const req = await db.bottlePickupRequest.findUnique({ where: { id } });
  if (!req) throw Errors.notFound("Pickup request not found.");
  return req;
}

/** Ops schedule the pickup → materialise (or update) a kind=PICKUP Delivery so it flows
    through the delivery board, auto-assignment and the executive app. */
export async function schedulePickup(id: string, input: { date?: string | Date | null; slot?: string | null; driverId?: string | null; actor?: PickupActor }) {
  const req = await loadOpen(id);
  if (["REFUNDED", "CLOSED", "CANCELLED"].includes(req.status)) throw Errors.conflict("This pickup request is already closed.");

  const when = input.date
    ? (typeof input.date === "string" ? istDayWindow(input.date).start : input.date)
    : (req.preferredDate ?? istDayWindow().start);
  const slot = input.slot ?? req.preferredSlot ?? null;
  const driverId = input.driverId ?? req.driverId ?? null;

  const delData = { kind: "PICKUP" as const, userId: req.userId, addressId: req.addressId, bottleCount: req.bottlesExpected, date: when, slot, driverId, status: "SCHEDULED" as const };
  let deliveryId = req.deliveryId;
  if (deliveryId) await db.delivery.update({ where: { id: deliveryId }, data: { date: when, slot, driverId } });
  else { const del = await db.delivery.create({ data: delData, select: { id: true } }); deliveryId = del.id; }

  const status: BottlePickupStatus = driverId ? "ASSIGNED" : "SCHEDULED";
  const updated = await db.bottlePickupRequest.update({
    where: { id }, data: { status, deliveryId, driverId, preferredSlot: slot, scheduledAt: new Date(), assignedAt: driverId ? new Date() : req.assignedAt },
    select: { id: true, status: true, deliveryId: true, driverId: true },
  });
  await audit({ userId: act(input.actor).actorId ?? null, actorRole: input.actor?.role ?? "operations", action: driverId ? "pickup.assigned" : "pickup.scheduled", target: `${id} · delivery ${deliveryId}${driverId ? ` · driver ${driverId}` : ""}`, ctx: input.actor?.ctx }).catch(() => {});
  return updated;
}

/** Called (best-effort) from completeDelivery when a PICKUP delivery is completed. */
export async function onPickupCollected(id: string, input: { bottlesCollected: number }) {
  const req = await db.bottlePickupRequest.findUnique({ where: { id } });
  if (!req || ["REFUNDED", "CLOSED", "CANCELLED"].includes(req.status)) return;
  const collected = Math.max(0, Math.round(input.bottlesCollected));
  const missing = Math.max(0, req.bottlesExpected - collected);
  await db.bottlePickupRequest.update({ where: { id }, data: { status: "COLLECTED", bottlesCollected: collected, bottlesMissing: missing, collectedAt: new Date() } });
  await audit({ userId: req.userId, actorRole: "delivery_executive", action: "pickup.collected", target: `${id} · collected ${collected}/${req.bottlesExpected}` }).catch(() => {});

  const cfg = await getBottleDepositConfig();
  if (!cfg.requireVerification && cfg.autoRefundOnCollection) {
    await refundPickup(id, { role: "system" }).catch((e) => log.error("pickup", `auto-refund failed for ${id}: ${(e as Error).message}`));
  }
}

/** Ops verify a collection (when verification is required) → triggers the refund. */
export async function verifyPickup(id: string, actor?: PickupActor) {
  const req = await loadOpen(id);
  if (req.status !== "COLLECTED") throw Errors.conflict("Only a collected pickup can be verified.");
  await db.bottlePickupRequest.update({ where: { id }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: actor?.userId ?? null } });
  await audit({ userId: actor?.userId ?? null, actorRole: actor?.role ?? "operations", action: "pickup.verified", target: id, ctx: actor?.ctx }).catch(() => {});
  return refundPickup(id, actor);
}

/** Credit the refundable deposit to the wallet. Idempotent (reference = pickup:<id> +
    the refundedPaise guard) so a retried completion never double-credits. */
export async function refundPickup(id: string, actor?: PickupActor) {
  const req = await loadOpen(id);
  if (req.refundedPaise > 0 || req.walletTxnRef) return { id, alreadyRefunded: true, refundedPaise: req.refundedPaise };
  if (!["COLLECTED", "VERIFIED"].includes(req.status)) throw Errors.conflict("Only a collected/verified pickup can be refunded.");

  const refundPaise = await refundableFor(req.userId, req.bottlesCollected);
  if (refundPaise <= 0) {
    // nothing eligible (e.g. deposit already fully refunded) → just close it out
    await db.bottlePickupRequest.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedById: actor?.userId ?? null } });
    await audit({ userId: req.userId, actorRole: actor?.role ?? "system", action: "pickup.closed", target: `${id} · no refund due`, ctx: actor?.ctx }).catch(() => {});
    return { id, refundedPaise: 0, closed: true };
  }

  const res = await refundBottleDeposit({
    userId: req.userId, amountPaise: refundPaise, qty: req.bottlesCollected,
    note: `Bottle-return pickup ${id}`, reference: `pickup:${id}`, ...act(actor),
  });

  await db.bottlePickupRequest.update({ where: { id }, data: { status: "REFUNDED", refundedPaise: res.refundedPaise, walletTxnRef: res.reference, refundedAt: new Date() } });

  // If the customer is now fully settled, close any ops "chase the empties" recovery — no
  // extra ledger row (completeDelivery already wrote the RETURNED that zeroed the balance).
  const { held } = await customerHeld(req.userId);
  if (held <= 0) await db.bottleRecovery.updateMany({ where: { userId: req.userId, status: "OPEN" }, data: { status: "RECOVERED", closedAt: new Date() } }).catch(() => {});

  await db.bottlePickupRequest.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedById: actor?.userId ?? null } });
  await audit({ userId: req.userId, actorRole: actor?.role ?? "system", action: "pickup.refunded", target: `${id} · ₹${Math.round(res.refundedPaise / 100)} · ${req.bottlesCollected} bottle(s) · ${res.reference}`, ctx: actor?.ctx }).catch(() => {});
  return { id, refundedPaise: res.refundedPaise, reference: res.reference, remainingHeld: held };
}

/** Cancel a pickup (customer or ops) — detach/skip the materialised Delivery. */
export async function cancelPickup(id: string, actor?: PickupActor) {
  const req = await loadOpen(id);
  if (["REFUNDED", "CLOSED", "CANCELLED"].includes(req.status)) throw Errors.conflict("This pickup request is already closed.");
  if (req.deliveryId) await db.delivery.update({ where: { id: req.deliveryId }, data: { status: "SKIPPED", driverId: null } }).catch(() => {});
  await db.bottlePickupRequest.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date(), closedById: actor?.userId ?? null } });
  await audit({ userId: req.userId, actorRole: actor?.role ?? "operations", action: "pickup.cancelled", target: id, ctx: actor?.ctx }).catch(() => {});
  return { id, status: "CANCELLED" };
}
