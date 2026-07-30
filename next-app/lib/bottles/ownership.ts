/* =============================================================
   DOODLY — Smart bottle ownership & deposit eligibility (single source).
   Bottle ownership is the source of truth for whether a customer owes a deposit:
   a deposit is charged ONLY for newly-issued bottles (the shortfall between what
   the plan needs and what the customer already holds, plus any voluntary extras),
   never for bottles they already own. New customers and customers who returned
   everything (owned 0) pay the mandatory deposit.
   Composes lib/bottles/balance (owned = held) + lib/bottles/deposit (held money)
   + lib/bottles/deposit-config (the single super-admin per-bottle rate).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { customerHeld } from "@/lib/bottles/balance";
import { depositHeldPaise } from "@/lib/bottles/deposit";
import { getBottleDepositConfig, effectiveDepositPerBottle } from "@/lib/bottles/deposit-config";

export type OwnershipStatus = "NEW" | "OWNS" | "RETURNED_ALL";

export interface BottleOwnership {
  owned: number;                 // reusable bottles the customer currently holds (Σ ISSUED−RETURNED−LOST)
  returnedLifetime: number;      // bottles ever returned
  outstanding: number;           // bottles not yet returned (= owned)
  depositPaidPaise: number;      // Σ PAID Order.depositPaise
  depositRefundedPaise: number;  // Σ DEPOSIT_REFUNDED
  depositHeldPaise: number;      // paid − refunded (money still on file)
  perBottlePaise: number;        // the active per-bottle deposit rate
  maxOwnership: number;
  status: OwnershipStatus;
}

/** Full bottle-ownership snapshot for a customer (checkout, exec, admin, reports). */
export async function bottleOwnership(userId: string): Promise<BottleOwnership> {
  const [{ held }, heldPaise, cfg, grouped, paid] = await Promise.all([
    customerHeld(userId),
    depositHeldPaise(userId),
    getBottleDepositConfig(),
    db.bottleLedger.groupBy({ by: ["event"], where: { userId }, _sum: { qty: true } }),
    db.order.aggregate({ where: { userId, status: "PAID" }, _sum: { depositPaise: true } }),
  ]);
  const sum = (e: string) => grouped.find((g) => g.event === e)?._sum.qty ?? 0;
  const issued = sum("ISSUED"), returned = sum("RETURNED");
  const perBottle = effectiveDepositPerBottle(cfg);
  const status: OwnershipStatus = held > 0 ? "OWNS" : issued > 0 ? "RETURNED_ALL" : "NEW";
  const refunded = Math.max(0, (paid._sum.depositPaise ?? 0) - heldPaise);
  return {
    owned: held, returnedLifetime: returned, outstanding: held,
    depositPaidPaise: paid._sum.depositPaise ?? 0, depositRefundedPaise: refunded, depositHeldPaise: heldPaise,
    perBottlePaise: perBottle, maxOwnership: cfg.maxBottleOwnership, status,
  };
}

export interface CheckoutDeposit {
  ownedBottles: number;
  requiredBottles: number;
  shortfallBottles: number;   // required − owned (mandatory new bottles)
  extraBottles: number;       // voluntary spare bottles requested (clamped)
  depositBottles: number;     // shortfall + extra = bottles actually issued & charged
  perBottlePaise: number;
  depositPaise: number;
  mandatory: boolean;         // is any part of this deposit non-removable (a shortfall exists)?
  reason: "new_customer" | "reuse_existing" | "top_up" | "voluntary_extra";
}

/**
 * The deposit to charge at checkout for a plan needing `requiredBottles`/delivery.
 * Deposit is charged only for newly-issued bottles; owned bottles are never re-charged.
 * Anonymous (no userId) = a new customer (owned 0).
 */
export async function depositForCheckout(input: { userId?: string | null; requiredBottles: number; extraBottles?: number }): Promise<CheckoutDeposit> {
  const required = Math.max(0, Math.round(input.requiredBottles));
  const owned = input.userId ? (await customerHeld(input.userId)).held : 0;
  const cfg = await getBottleDepositConfig();
  const perBottle = effectiveDepositPerBottle(cfg);

  const shortfall = Math.max(0, required - owned);
  const room = Math.max(0, cfg.maxBottleOwnership - owned - shortfall);   // headroom for voluntary spares
  const extra = Math.min(Math.max(0, Math.round(input.extraBottles ?? 0)), room);
  const depositBottles = shortfall + extra;
  const depositPaise = depositBottles * perBottle;

  const reason: CheckoutDeposit["reason"] =
    depositBottles === 0 ? "reuse_existing"
    : shortfall === 0 && extra > 0 ? "voluntary_extra"
    : owned === 0 ? "new_customer"
    : "top_up";

  return { ownedBottles: owned, requiredBottles: required, shortfallBottles: shortfall, extraBottles: extra, depositBottles, perBottlePaise: perBottle, depositPaise, mandatory: shortfall > 0, reason };
}
