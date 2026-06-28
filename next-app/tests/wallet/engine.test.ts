import { describe, it, expect } from "vitest";
import {
  evaluateTrialCashback, computeWalletApply, generateReference, DEFAULT_CASHBACK_RULES,
} from "@/lib/wallet/engine";

const base = {
  rules: DEFAULT_CASHBACK_RULES,         // enabled, ₹200, [p30, p90]
  hasCompletedPaidTrial: true,
  trialRefunded: false,
  targetPlanSlug: "p30",
  alreadyCredited: false,
};

describe("trial-pack cashback eligibility", () => {
  it("credits ₹200 for a completed trial upgrading to 30-day or 90-day", () => {
    expect(evaluateTrialCashback({ ...base, targetPlanSlug: "p30" })).toEqual({ eligible: true, amountPaise: 20000, reason: "eligible" });
    expect(evaluateTrialCashback({ ...base, targetPlanSlug: "p90" })).toEqual({ eligible: true, amountPaise: 20000, reason: "eligible" });
  });

  it("does NOT credit for Single Pour or 7-Day Fresh Start", () => {
    expect(evaluateTrialCashback({ ...base, targetPlanSlug: "single" }).eligible).toBe(false);
    expect(evaluateTrialCashback({ ...base, targetPlanSlug: "single" }).reason).toBe("plan_not_eligible");
    expect(evaluateTrialCashback({ ...base, targetPlanSlug: "p7" }).reason).toBe("plan_not_eligible");
  });

  it("does NOT credit if the trial was cancelled (not completed/paid)", () => {
    expect(evaluateTrialCashback({ ...base, hasCompletedPaidTrial: false }).reason).toBe("no_completed_trial");
  });

  it("does NOT credit if the trial was refunded", () => {
    expect(evaluateTrialCashback({ ...base, trialRefunded: true }).reason).toBe("trial_refunded");
  });

  it("does NOT credit twice (already credited)", () => {
    expect(evaluateTrialCashback({ ...base, alreadyCredited: true }).reason).toBe("already_credited");
  });

  it("does NOT credit when the feature is disabled", () => {
    expect(evaluateTrialCashback({ ...base, rules: { ...DEFAULT_CASHBACK_RULES, enabled: false } }).reason).toBe("disabled");
  });

  it("honours a custom configured amount and eligible-plan list", () => {
    const rules = { enabled: true, amountPaise: 30000, eligiblePlanSlugs: ["p90"] };
    expect(evaluateTrialCashback({ ...base, rules, targetPlanSlug: "p90" })).toEqual({ eligible: true, amountPaise: 30000, reason: "eligible" });
    expect(evaluateTrialCashback({ ...base, rules, targetPlanSlug: "p30" }).reason).toBe("plan_not_eligible");
  });
});

describe("wallet apply maths", () => {
  it("applies the full balance when it covers part of the order", () => {
    expect(computeWalletApply(20000, 50000)).toEqual({ appliedPaise: 20000, payablePaise: 30000, remainingBalancePaise: 0 });
  });

  it("never applies more than the order total", () => {
    expect(computeWalletApply(50000, 20000)).toEqual({ appliedPaise: 20000, payablePaise: 0, remainingBalancePaise: 30000 });
  });

  it("supports partial use via requestedPaise (clamped to balance & total)", () => {
    expect(computeWalletApply(50000, 40000, 10000)).toEqual({ appliedPaise: 10000, payablePaise: 30000, remainingBalancePaise: 40000 });
    expect(computeWalletApply(50000, 40000, 99999).appliedPaise).toBe(40000); // clamped to total
    expect(computeWalletApply(15000, 40000, 99999).appliedPaise).toBe(15000); // clamped to balance
  });

  it("handles zero balance and zero total", () => {
    expect(computeWalletApply(0, 40000)).toEqual({ appliedPaise: 0, payablePaise: 40000, remainingBalancePaise: 0 });
    expect(computeWalletApply(20000, 0)).toEqual({ appliedPaise: 0, payablePaise: 0, remainingBalancePaise: 20000 });
  });
});

describe("reference codes", () => {
  it("are prefixed and unambiguous", () => {
    expect(generateReference(() => 0.5)).toMatch(/^WTX-[2-9A-HJ-NP-Z]{6}$/);
    expect(generateReference()).not.toBe(generateReference());
  });
});
