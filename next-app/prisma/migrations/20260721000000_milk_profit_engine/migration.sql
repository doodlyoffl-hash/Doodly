-- Milk Procurement & Profit engine: tanker-based procurement in KG, a configurable
-- seasonal cost formula, and a FIFO inventory lot that retail + B2B sales draw down
-- oldest-first. Fully additive: two new enums, three new tables, one nullable FK
-- column reused via relation only. No drops, no data loss, safe to re-run.

-- enums (guarded so a re-run is a no-op)
DO $$ BEGIN
  CREATE TYPE "TankerStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConsumptionChannel" AS ENUM ('RETAIL', 'B2B', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- editable seasonal rates (singleton row id = 'singleton')
CREATE TABLE IF NOT EXISTS "MilkCostConfig" (
  "id"               TEXT NOT NULL DEFAULT 'singleton',
  "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.03,
  "milkRatePaise"    INTEGER NOT NULL DEFAULT 450,
  "fatRatePaise"     INTEGER NOT NULL DEFAULT 82000,
  "transportPaise"   INTEGER NOT NULL DEFAULT 950000,
  "currency"         TEXT NOT NULL DEFAULT 'INR',
  "taxBps"           INTEGER NOT NULL DEFAULT 0,
  "financialYear"    TEXT,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy"        TEXT,
  CONSTRAINT "MilkCostConfig_pkey" PRIMARY KEY ("id")
);

-- tanker = one costed procurement batch + FIFO lot
CREATE TABLE IF NOT EXISTS "MilkTanker" (
  "id"                TEXT NOT NULL,
  "code"              TEXT NOT NULL,
  "procurementDate"   TIMESTAMP(3) NOT NULL,
  "tankerNo"          TEXT NOT NULL,
  "supplier"          TEXT NOT NULL,
  "farmerId"          TEXT,
  "quantityKg"        DOUBLE PRECISION NOT NULL,
  "fatPct"            DOUBLE PRECISION NOT NULL,
  "snfPct"            DOUBLE PRECISION,
  "remarks"           TEXT,
  "conversionFactor"  DOUBLE PRECISION NOT NULL,
  "milkRatePaise"     INTEGER NOT NULL,
  "fatRatePaise"      INTEGER NOT NULL,
  "litres"            DOUBLE PRECISION NOT NULL,
  "kgFat"             DOUBLE PRECISION NOT NULL,
  "milkCostPaise"     INTEGER NOT NULL,
  "fatCostPaise"      INTEGER NOT NULL,
  "transportPaise"    INTEGER NOT NULL,
  "totalCostPaise"    INTEGER NOT NULL,
  "costPerLitrePaise" INTEGER NOT NULL,
  "costPerKgPaise"    INTEGER NOT NULL,
  "consumedLitres"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remainingLitres"   DOUBLE PRECISION NOT NULL,
  "status"            "TankerStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt"          TIMESTAMP(3),
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "MilkTanker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MilkTanker_code_key" ON "MilkTanker"("code");
CREATE INDEX IF NOT EXISTS "MilkTanker_procurementDate_idx" ON "MilkTanker"("procurementDate");
CREATE INDEX IF NOT EXISTS "MilkTanker_status_procurementDate_idx" ON "MilkTanker"("status", "procurementDate");
CREATE INDEX IF NOT EXISTS "MilkTanker_deletedAt_idx" ON "MilkTanker"("deletedAt");

-- FIFO consumption ledger (one row per draw against a tanker)
CREATE TABLE IF NOT EXISTS "TankerConsumption" (
  "id"        TEXT NOT NULL,
  "tankerId"  TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "channel"   "ConsumptionChannel" NOT NULL,
  "litres"    DOUBLE PRECISION NOT NULL,
  "costPaise" INTEGER NOT NULL,
  "sourceRef" TEXT,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TankerConsumption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TankerConsumption_date_idx" ON "TankerConsumption"("date");
CREATE INDEX IF NOT EXISTS "TankerConsumption_tankerId_idx" ON "TankerConsumption"("tankerId");
CREATE INDEX IF NOT EXISTS "TankerConsumption_sourceRef_idx" ON "TankerConsumption"("sourceRef");
CREATE INDEX IF NOT EXISTS "TankerConsumption_channel_date_idx" ON "TankerConsumption"("channel", "date");

-- foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS on older PG)
DO $$ BEGIN
  ALTER TABLE "MilkTanker"
    ADD CONSTRAINT "MilkTanker_farmerId_fkey"
    FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "TankerConsumption"
    ADD CONSTRAINT "TankerConsumption_tankerId_fkey"
    FOREIGN KEY ("tankerId") REFERENCES "MilkTanker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
