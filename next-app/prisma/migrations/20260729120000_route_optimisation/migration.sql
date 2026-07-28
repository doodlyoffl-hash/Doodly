-- Route optimisation — per-stop leg metrics on Delivery + planned round-trip
-- totals on TripHistory. Fully additive: all columns nullable, no drops. Idempotent.

ALTER TABLE "Delivery"
  ADD COLUMN IF NOT EXISTS "legDistanceKm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "legTravelMin"  INTEGER,
  ADD COLUMN IF NOT EXISTS "cumulativeKm"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "etaMinutes"    INTEGER,
  ADD COLUMN IF NOT EXISTS "routeSource"   TEXT;

ALTER TABLE "TripHistory"
  ADD COLUMN IF NOT EXISTS "plannedDistanceKm"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "plannedDurationMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "routeSource"        TEXT,
  ADD COLUMN IF NOT EXISTS "routePlanHash"      TEXT;
