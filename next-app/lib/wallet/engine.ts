/* =============================================================
   DOODLY Wallet — PURE engine (no DB, no I/O). Fully unit-testable.
   Encodes the Trial Pack Cashback business rule + wallet-apply maths.
   The service layer resolves DB facts and feeds them here.
   ============================================================= */

/** Admin-configurable cashback rules (mirror of CashbackConfig). */
export interface CashbackRules {
  enabled: boolean;
  amountPaise: number;
  eligiblePlanSlugs: string[];
}

/** Sensible defaults if no config row exists yet (₹200 → p30 / p90). */
export const DEFAULT_CASHBACK_RULES: CashbackRules = {
  enabled: true,
  amountPaise: 20000,
  eligiblePlanSlugs: ["p30", "p90"],
};

export interface TrialCashbackInput {
  rules: CashbackRules;
  /** Trial Pack was paid AND completed (delivered/active), not cancelled. */
  hasCompletedPaidTrial: boolean;
  /** Trial Pack was refunded (disqualifies). */
  trialRefunded: boolean;
  /** Plan slug being purchased now. */
  targetPlanSlug: string;
  /** A cashback was already credited to this customer (idempotency). */
  alreadyCredited: boolean;
}

export type CashbackReason =
  | "eligible" | "disabled" | "already_credited" | "no_completed_trial"
  | "trial_refunded" | "plan_not_eligible";

export interface CashbackDecision {
  eligible: boolean;
  amountPaise: number;
  reason: CashbackReason;
}

const deny = (reason: CashbackReason): CashbackDecision => ({ eligible: false, amountPaise: 0, reason });

/**
 * Decide whether the Trial Pack cashback should be credited. Order matters:
 * disabled → already-credited → refunded → no-completed-trial → plan-not-eligible.
 */
export function evaluateTrialCashback(i: TrialCashbackInput): CashbackDecision {
  if (!i.rules.enabled) return deny("disabled");
  if (i.alreadyCredited) return deny("already_credited");
  if (i.trialRefunded) return deny("trial_refunded");
  if (!i.hasCompletedPaidTrial) return deny("no_completed_trial");
  if (!i.rules.eligiblePlanSlugs.includes(i.targetPlanSlug)) return deny("plan_not_eligible");
  return { eligible: true, amountPaise: i.rules.amountPaise, reason: "eligible" };
}

export interface WalletApply {
  appliedPaise: number;          // amount drawn from the wallet
  payablePaise: number;          // remaining to pay via the chosen method
  remainingBalancePaise: number; // wallet balance after applying
}

/**
 * Compute how much wallet balance to apply to an order. Never applies more than
 * the balance or the order total. `requestedPaise` omitted = apply the maximum.
 */
export function computeWalletApply(balancePaise: number, orderTotalPaise: number, requestedPaise?: number): WalletApply {
  const bal = Math.max(0, Math.floor(balancePaise || 0));
  const total = Math.max(0, Math.floor(orderTotalPaise || 0));
  const maxApply = Math.min(bal, total);
  const applied = requestedPaise == null
    ? maxApply
    : Math.min(Math.max(0, Math.floor(requestedPaise)), maxApply);
  return { appliedPaise: applied, payablePaise: total - applied, remainingBalancePaise: bal - applied };
}

/** Human, readable, unambiguous wallet-txn reference, e.g. "WTX-7K3M2A". */
export function generateReference(rand: () => number = Math.random): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(rand() * alphabet.length)];
  return `WTX-${code}`;
}
