-- Immutable Tanker Closing Report — frozen reconciliation snapshot at tanker close.
-- Additive + idempotent.
CREATE TABLE IF NOT EXISTS "TankerClosingReport" (
  "id"                   TEXT NOT NULL,
  "tankerId"             TEXT NOT NULL,
  "closedAt"             TIMESTAMP(3) NOT NULL,
  "closedById"           TEXT,
  "closedByRole"         TEXT,
  "closeReason"          TEXT,
  "forced"               BOOLEAN NOT NULL DEFAULT false,
  "openingLitres"        DOUBLE PRECISION NOT NULL,
  "retailLitres"         DOUBLE PRECISION NOT NULL,
  "b2bLitres"            DOUBLE PRECISION NOT NULL,
  "wastageLitres"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "carryForwardLitres"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "closingLitres"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "retailRevenuePaise"   INTEGER NOT NULL,
  "b2bRevenuePaise"      INTEGER NOT NULL,
  "totalRevenuePaise"    INTEGER NOT NULL,
  "procurementCostPaise" INTEGER NOT NULL,
  "transportPaise"       INTEGER NOT NULL,
  "totalCostPaise"       INTEGER NOT NULL,
  "cogsPaise"            INTEGER NOT NULL,
  "grossProfitPaise"     INTEGER NOT NULL,
  "netProfitPaise"       INTEGER NOT NULL,
  "retailCustomers"      INTEGER NOT NULL,
  "retailDeliveries"     INTEGER NOT NULL,
  "b2bBusinesses"        INTEGER NOT NULL,
  "b2bDeliveries"        INTEGER NOT NULL,
  "linesJson"            JSONB NOT NULL,
  "generatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TankerClosingReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TankerClosingReport_tankerId_key" ON "TankerClosingReport"("tankerId");
CREATE INDEX IF NOT EXISTS "TankerClosingReport_closedAt_idx" ON "TankerClosingReport"("closedAt");

DO $$ BEGIN
  ALTER TABLE "TankerClosingReport"
    ADD CONSTRAINT "TankerClosingReport_tankerId_fkey"
    FOREIGN KEY ("tankerId") REFERENCES "MilkTanker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
