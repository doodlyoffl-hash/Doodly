-- Warehouse distance engine — per-delivery distance/time from the configurable
-- DOODLY warehouse origin. Fully additive: all columns nullable, no drops, no
-- data loss. Idempotent (IF NOT EXISTS) so re-applies are safe.

ALTER TABLE "Delivery"
  ADD COLUMN IF NOT EXISTS "distanceKm"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "travelTimeMin"  INTEGER,
  ADD COLUMN IF NOT EXISTS "distanceSource" TEXT,
  ADD COLUMN IF NOT EXISTS "routeStatus"    TEXT,
  ADD COLUMN IF NOT EXISTS "distanceCalcAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "distanceMeta"   JSONB;

-- Find deliveries still needing a first distance calc (the cron/backfill sweep).
CREATE INDEX IF NOT EXISTS "Delivery_distanceCalcAt_idx" ON "Delivery"("distanceCalcAt");
