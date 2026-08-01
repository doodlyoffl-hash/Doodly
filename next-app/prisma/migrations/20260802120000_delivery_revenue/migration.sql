-- Delivery-based retail revenue recognition (additive + idempotent).
-- The recognised retail revenue of THIS delivery, frozen at completion so a later
-- catalogue price change never re-values a past delivered day. Null until stamped
-- (the P&L falls back to live-compute for null rows).
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "revenuePaise" INTEGER;
