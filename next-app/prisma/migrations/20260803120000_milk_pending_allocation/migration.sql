-- FIFO carry-forward Pending Allocation queue (one row per oversold IST day). Additive + idempotent.
CREATE TABLE IF NOT EXISTS "MilkPendingAllocation" (
  "id"                TEXT NOT NULL,
  "date"              TIMESTAMP(3) NOT NULL,
  "retailLitres"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "b2bLitres"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalLitres"       DOUBLE PRECISION NOT NULL,
  "soldRetailLitres"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "soldB2bLitres"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"            TEXT NOT NULL DEFAULT 'PENDING',
  "reason"            TEXT,
  "clearedAt"         TIMESTAMP(3),
  "clearedByTankerId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MilkPendingAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MilkPendingAllocation_date_key" ON "MilkPendingAllocation"("date");
CREATE INDEX IF NOT EXISTS "MilkPendingAllocation_status_date_idx" ON "MilkPendingAllocation"("status", "date");
