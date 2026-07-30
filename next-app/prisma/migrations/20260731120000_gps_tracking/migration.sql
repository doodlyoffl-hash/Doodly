-- GPS distance tracking (additive + idempotent).

-- Shift: actual-travelled-distance fields.
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "startLat" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "startLng" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "endLat" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "endLng" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "actualDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "plannedDistanceKm" DOUBLE PRECISION;
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "gpsPointCount" INTEGER NOT NULL DEFAULT 0;

-- Delivery: timeline fields.
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "reachedAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "actualLegKm" DOUBLE PRECISION;

-- ShiftGpsPoint: raw track store.
CREATE TABLE IF NOT EXISTS "ShiftGpsPoint" (
  "id" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "accuracyM" DOUBLE PRECISION,
  "speed" DOUBLE PRECISION,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "clientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftGpsPoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftGpsPoint_clientId_key" ON "ShiftGpsPoint"("clientId");
CREATE INDEX IF NOT EXISTS "ShiftGpsPoint_shiftId_capturedAt_idx" ON "ShiftGpsPoint"("shiftId", "capturedAt");
CREATE INDEX IF NOT EXISTS "ShiftGpsPoint_driverId_capturedAt_idx" ON "ShiftGpsPoint"("driverId", "capturedAt");

DO $$ BEGIN
  ALTER TABLE "ShiftGpsPoint" ADD CONSTRAINT "ShiftGpsPoint_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
