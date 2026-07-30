-- Executive GPS pin correction — append-only history of coordinate corrections.
-- Address.lat/lng keeps the latest pin; this table is the audit/history/report source.
-- Additive + idempotent.

DO $$ BEGIN
  CREATE TYPE "GeoCorrectionSource" AS ENUM ('EXEC_GPS', 'OFFLINE_SYNC', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "GeoCorrection" (
  "id"                TEXT NOT NULL,
  "addressId"         TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "deliveryId"        TEXT,
  "driverId"          TEXT,
  "execEmployeeId"    TEXT,
  "correctedById"     TEXT,
  "correctedByRole"   TEXT,
  "oldLat"            DOUBLE PRECISION,
  "oldLng"            DOUBLE PRECISION,
  "newLat"            DOUBLE PRECISION NOT NULL,
  "newLng"            DOUBLE PRECISION NOT NULL,
  "distanceMovedKm"   DOUBLE PRECISION,
  "deviceAccuracyM"   DOUBLE PRECISION,
  "warehouseBeforeKm" DOUBLE PRECISION,
  "warehouseAfterKm"  DOUBLE PRECISION,
  "declaredPincode"   TEXT,
  "pinMatch"          BOOLEAN,
  "source"            "GeoCorrectionSource" NOT NULL DEFAULT 'EXEC_GPS',
  "reason"            TEXT,
  "clientId"          TEXT,
  "capturedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeoCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GeoCorrection_clientId_key" ON "GeoCorrection"("clientId");
CREATE INDEX IF NOT EXISTS "GeoCorrection_addressId_createdAt_idx" ON "GeoCorrection"("addressId", "createdAt");
CREATE INDEX IF NOT EXISTS "GeoCorrection_correctedById_idx" ON "GeoCorrection"("correctedById");
CREATE INDEX IF NOT EXISTS "GeoCorrection_declaredPincode_idx" ON "GeoCorrection"("declaredPincode");

DO $$ BEGIN
  ALTER TABLE "GeoCorrection" ADD CONSTRAINT "GeoCorrection_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GeoCorrection" ADD CONSTRAINT "GeoCorrection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GeoCorrection" ADD CONSTRAINT "GeoCorrection_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GeoCorrection" ADD CONSTRAINT "GeoCorrection_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
