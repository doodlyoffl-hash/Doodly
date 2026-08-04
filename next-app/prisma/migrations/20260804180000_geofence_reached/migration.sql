-- Automatic "Reached Customer" geofence detection (additive + idempotent).
-- The delivery executive taps "On the way"; the server watches the GPS stream and
-- auto-flips the stop to REACHED when the exec enters the customer's verified-pin
-- geofence (configurable radius/dwell). "Delivered" stays a manual action. These
-- columns record the arrival timeline + the GPS proof of the auto-arrival. All
-- nullable / defaulted, so back-filling existing rows is unnecessary.
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "onThewayAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "geofenceEnteredAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "reachedAuto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "reachedDistanceM" DOUBLE PRECISION;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "reachedAccuracyM" DOUBLE PRECISION;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "reachedLat" DOUBLE PRECISION;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "reachedLng" DOUBLE PRECISION;
