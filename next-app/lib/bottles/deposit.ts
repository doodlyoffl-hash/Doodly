/* =============================================================
   DOODLY — Bottle deposit math (single source for the refund workflow).
   The held deposit is derived from PAID orders minus refunds (there is no
   DEPOSIT_CHARGED ledger row in production — see lib/bottles/service.ts).
   A refund is always capped at the money actually held, so we can never
   over-refund regardless of the per-bottle rate.
   ============================================================= */
import "server-only";
import { Prisma, DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getBottleDepositConfig, effectiveDepositPerBottle } from "@/lib/bottles/deposit-config";

/** Effective per-bottle deposit in paise (config override else catalogue default). */
export async function depositPerBottlePaise(): Promise<number> {
  return effectiveDepositPerBottle(await getBottleDepositConfig());
}

/** Prisma `where` matching orders whose bottle deposit is genuinely HELD by the business:
 *  either PREPAID (Order PAID) OR a confirmed CASH-on-delivery order that has actually been
 *  DELIVERED. A COD deposit is collected in cash AT THE DOOR, so it only becomes "held" once a
 *  stop under that order (one-time delivery, or the subscription's first delivery) is delivered.
 *  Before this, COD deposits were invisible (status filtered to PAID only) → COD customers could
 *  never be refunded their deposit and the liability was undercounted. The single source of truth
 *  for every deposit-held sum. */
export function heldDepositWhere(userId?: string): Prisma.OrderWhereInput {
  const delivered: Prisma.DeliveryWhereInput = { status: { in: [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIALLY_DELIVERED] } };
  return {
    ...(userId ? { userId } : {}),
    depositPaise: { gt: 0 },
    OR: [
      { status: "PAID" },
      { payment: { method: "CASH" }, OR: [{ delivery: { is: delivered } }, { subscription: { deliveries: { some: delivered } } }] },
    ],
  };
}

/** Deposit money still held for a customer = Σ held-deposit Order.depositPaise − Σ DEPOSIT_REFUNDED. */
export async function depositHeldPaise(userId: string): Promise<number> {
  const [charged, refunded] = await Promise.all([
    db.order.aggregate({ where: heldDepositWhere(userId), _sum: { depositPaise: true } }),
    db.bottleLedger.aggregate({ where: { userId, event: "DEPOSIT_REFUNDED" }, _sum: { amountPaise: true } }),
  ]);
  return Math.max(0, (charged._sum.depositPaise ?? 0) - (refunded._sum.amountPaise ?? 0));
}

/** Refundable amount for returning `qty` bottles = qty × per-bottle, capped at money held. */
export async function refundableFor(userId: string, qty: number): Promise<number> {
  const per = await depositPerBottlePaise();
  const held = await depositHeldPaise(userId);
  return Math.max(0, Math.min(Math.max(0, Math.round(qty)) * per, held));
}
