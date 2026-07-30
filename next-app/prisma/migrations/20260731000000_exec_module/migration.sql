-- Exec module (Phase 0): Shift model, richer DeliveryStatus values, Delivery.execRemark.
-- Additive + idempotent so it is safe to (re)apply on the shared production database.

-- 1) DeliveryStatus enum additions (values are NOT used elsewhere in this script,
--    so this is safe even inside an implicit transaction).
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_DELIVERED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_UNAVAILABLE';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2) Delivery.execRemark — the executive's own note on the outcome.
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "execRemark" TEXT;

-- 3) ShiftStatus enum.
DO $$ BEGIN
  CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 4) Shift table (durable work-shift log with per-shift totals).
CREATE TABLE IF NOT EXISTS "Shift" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "workedMinutes" INTEGER,
  "deliveriesCount" INTEGER NOT NULL DEFAULT 0,
  "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bottlesDelivered" INTEGER NOT NULL DEFAULT 0,
  "bottlesCollected" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Shift_driverId_startedAt_idx" ON "Shift"("driverId", "startedAt");
CREATE INDEX IF NOT EXISTS "Shift_driverId_status_idx" ON "Shift"("driverId", "status");

DO $$ BEGIN
  ALTER TABLE "Shift" ADD CONSTRAINT "Shift_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
