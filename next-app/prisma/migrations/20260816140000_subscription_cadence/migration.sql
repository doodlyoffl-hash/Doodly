-- Subscription delivery cadence (alternate-day support). Additive, idempotent.
-- 1 = daily (existing behaviour), 2 = alternate-day, general every-N eligible days.
-- Existing subscriptions default to 1 → schedule behaviour is unchanged.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "cadence" INTEGER NOT NULL DEFAULT 1;
