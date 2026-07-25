-- Subscription Lifecycle Management Engine.
-- Fully additive: three nullable columns, no drops, no data loss.
--   Subscription.targetDeliveries — the paid delivery count (make-ups/skips extend
--     endDate, not this; manual Extend raises it). NULL on existing rows ⇒ code
--     falls back to plan.days.
--   Delivery.adjustReason / adjustNote — why a stop was SKIPPED/FAILED/adjusted,
--     for the calendar colours + reports.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "targetDeliveries" INTEGER;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "adjustReason" TEXT;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "adjustNote" TEXT;
