-- Address geolocation verification: persist whether a saved address has a real pin
-- that agrees with the entered PIN code (+ cached serviceability & warehouse distance).
-- Fully additive + idempotent; defaults keep every existing row valid.

ALTER TABLE "Address"
  ADD COLUMN IF NOT EXISTS "verified"                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verifiedAt"              TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "serviceable"             BOOLEAN,
  ADD COLUMN IF NOT EXISTS "distanceFromWarehouseKm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
