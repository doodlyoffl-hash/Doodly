/* =============================================================
   DOODLY — Bottle deposit math (single source for the refund workflow).
   The held deposit is derived from PAID orders minus refunds (there is no
   DEPOSIT_CHARGED ledger row in production — see lib/bottles/service.ts).
   A refund is always capped at the money actually held, so we can never
   over-refund regardless of the per-bottle rate.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { getBottleDepositConfig, effectiveDepositPerBottle } from "@/lib/bottles/deposit-config";

/** Effective per-bottle deposit in paise (config override else catalogue default). */
export async function depositPerBottlePaise(): Promise<number> {
  return effectiveDepositPerBottle(await getBottleDepositConfig());
}

/** Deposit money still held for a customer = Σ PAID Order.depositPaise − Σ DEPOSIT_REFUNDED. */
export async function depositHeldPaise(userId: string): Promise<number> {
  const [charged, refunded] = await Promise.all([
    db.order.aggregate({ where: { userId, status: "PAID" }, _sum: { depositPaise: true } }),
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
