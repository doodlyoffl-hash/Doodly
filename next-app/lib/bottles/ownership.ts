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
import { depositHeldPaise, heldDepositWhere } from "@/lib/bottles/deposit";
import { getBottleDepositConfig, effectiveDepositPerBottle } from "@/lib/bottles/deposit-config";

export type OwnershipStatus = "NEW" | "OWNS" | "RETURNED_ALL";

export interface BottleOwnership {
  owned: number;                 // reusable bottles the customer currently holds (Σ ISSUED−RETURNED−LOST)
  issuedLifetime: number;        // bottles ever issued
  returnedLifetime: number;      // bottles ever returned
  lostLifetime: number;          // bottles ever written off (lost/broken/kept)
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
    db.order.aggregate({ where: heldDepositWhere(userId), _sum: { depositPaise: true } }),   // prepaid + delivered-COD
  ]);
  const sum = (e: string) => grouped.find((g) => g.event === e)?._sum.qty ?? 0;
  const issued = sum("ISSUED"), returned = sum("RETURNED"), lost = sum("LOST");
  const perBottle = effectiveDepositPerBottle(cfg);
  const status: OwnershipStatus = held > 0 ? "OWNS" : issued > 0 ? "RETURNED_ALL" : "NEW";
  const refunded = Math.max(0, (paid._sum.depositPaise ?? 0) - heldPaise);
  return {
    owned: held, issuedLifetime: issued, returnedLifetime: returned, lostLifetime: lost, outstanding: held,
    depositPaidPaise: paid._sum.depositPaise ?? 0, depositRefundedPaise: refunded, depositHeldPaise: heldPaise,
    perBottlePaise: perBottle, maxOwnership: cfg.maxBottleOwnership, status,
  };
}

export type UnavailableReason = "lost" | "broken" | "kept" | "other";

export interface CheckoutDeposit {
  ownedBottles: number;          // bottles the ledger says the customer holds
  unavailableBottles: number;    // owned bottles the customer declares they no longer have (Step 3)
  unavailableReason: UnavailableReason | null;
  effectiveOwned: number;        // owned − unavailable (bottles actually reusable)
  requiredBottles: number;
  reuseBottles: number;          // owned bottles reused at ₹0 (never re-charged)
  replacementBottles: number;    // charged replacements for the declared-unavailable bottles
  shortfallBottles: number;      // required − effectiveOwned (mandatory new bottles, incl. replacements)
  extraBottles: number;          // voluntary spare bottles requested (clamped)
  depositBottles: number;        // shortfall + extra = bottles actually issued & charged
  perBottlePaise: number;
  depositPaise: number;
  mandatory: boolean;            // is any part of this deposit non-removable (a shortfall exists)?
  reason: "new_customer" | "reuse_existing" | "top_up" | "voluntary_extra" | "replacement";
}

/**
 * The deposit to charge at checkout for a plan needing `requiredBottles`/delivery.
 * Deposit is charged only for newly-issued bottles; owned bottles are never re-charged —
 * UNLESS the customer declares they no longer have some (lost / broken / kept): those stop
 * counting as owned, so a replacement deposit is charged for them (Step 3). PURE (no writes) —
 * safe for the preview and the checkout charge. Anonymous (no userId) = a new customer (owned 0).
 */
export async function depositForCheckout(input: { userId?: string | null; requiredBottles: number; extraBottles?: number; unavailableBottles?: number; unavailableReason?: UnavailableReason | null }): Promise<CheckoutDeposit> {
  const required = Math.max(0, Math.round(input.requiredBottles));
  const owned = input.userId ? (await customerHeld(input.userId)).held : 0;
  const cfg = await getBottleDepositConfig();
  const perBottle = effectiveDepositPerBottle(cfg);

  // Bottles the customer says they no longer have — capped at what they actually hold.
  const unavailable = Math.min(owned, Math.max(0, Math.round(input.unavailableBottles ?? 0)));
  const unavailableReason: UnavailableReason | null = unavailable > 0 ? (input.unavailableReason ?? "other") : null;
  const effectiveOwned = owned - unavailable;                 // only these are reusable at ₹0

  const shortfall = Math.max(0, required - effectiveOwned);   // includes replacements for the unavailable ones
  const reuseBottles = Math.min(effectiveOwned, required);    // owned bottles genuinely reused
  const replacementBottles = Math.min(unavailable, shortfall);
  const room = Math.max(0, cfg.maxBottleOwnership - effectiveOwned - shortfall);   // headroom for voluntary spares
  const extra = Math.min(Math.max(0, Math.round(input.extraBottles ?? 0)), room);
  const depositBottles = shortfall + extra;
  const depositPaise = depositBottles * perBottle;

  const reason: CheckoutDeposit["reason"] =
    replacementBottles > 0 ? "replacement"
    : depositBottles === 0 ? "reuse_existing"
    : shortfall === 0 && extra > 0 ? "voluntary_extra"
    : owned === 0 ? "new_customer"
    : "top_up";

  return { ownedBottles: owned, unavailableBottles: unavailable, unavailableReason, effectiveOwned, requiredBottles: required, reuseBottles, replacementBottles, shortfallBottles: shortfall, extraBottles: extra, depositBottles, perBottlePaise: perBottle, depositPaise, mandatory: shortfall > 0, reason };
}

/** Idempotently write off the bottles a customer declared they no longer have (Step 3): a LOST
 *  BottleLedger row (so `held` drops, matching what depositForCheckout charged) + audit. Keyed by
 *  orderId in the note so a checkout retry never double-writes. Called AFTER the order is created. */
export async function recordBottleUnavailability(args: { userId: string; qty: number; reason: UnavailableReason; orderId?: string | null; subscriptionId?: string | null; actorId?: string | null; actorRole?: string | null }): Promise<{ written: boolean; qty: number }> {
  const qty = Math.max(0, Math.round(args.qty));
  if (qty <= 0 || !args.userId) return { written: false, qty: 0 };
  const ref = args.orderId ? `order:${args.orderId}` : args.subscriptionId ? `sub:${args.subscriptionId}` : null;
  if (ref) {
    const existing = await db.bottleLedger.findFirst({ where: { userId: args.userId, event: "LOST", note: { contains: ref } }, select: { id: true } });
    if (existing) return { written: false, qty };   // already recorded for this order (idempotent)
  }
  const label = args.reason === "broken" ? "Broken" : args.reason === "kept" ? "Kept by customer" : args.reason === "lost" ? "Lost" : "Unavailable";
  await db.bottleLedger.create({ data: { userId: args.userId, event: "LOST", qty, amountPaise: 0, note: `${label} — declared at checkout${ref ? ` (${ref})` : ""}` } });
  const { audit } = await import("@/lib/auth/audit");
  await audit({ userId: args.actorId ?? args.userId, actorRole: args.actorRole ?? "customer", action: `bottle.${args.reason === "broken" ? "broken" : args.reason === "kept" ? "kept" : "lost"}`, target: `cust ${args.userId} · ${qty} bottle(s) · ${label}${args.subscriptionId ? ` · sub ${args.subscriptionId}` : ""}${args.orderId ? ` · order ${args.orderId}` : ""} — replacement deposit charged` }).catch(() => {});
  return { written: true, qty };
}
