-- B2B delivery-based revenue recognition: freeze net revenue on delivery + immutable
-- post-delivery adjustment ledger. Additive + idempotent.
ALTER TABLE "BusinessOrder" ADD COLUMN IF NOT EXISTS "revenuePaise" INTEGER;
ALTER TABLE "BusinessOrder" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "BusinessOrder_deliveredAt_idx" ON "BusinessOrder"("deliveredAt");

CREATE TABLE IF NOT EXISTS "BusinessRevenueAdjustment" (
  "id"              TEXT NOT NULL,
  "businessOrderId" TEXT NOT NULL,
  "businessId"      TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "amountPaise"     INTEGER NOT NULL,
  "litresReversed"  INTEGER,
  "reason"          TEXT,
  "effectiveOn"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"     TEXT,
  "createdByRole"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessRevenueAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BusinessRevenueAdjustment_businessId_effectiveOn_idx" ON "BusinessRevenueAdjustment"("businessId", "effectiveOn");
CREATE INDEX IF NOT EXISTS "BusinessRevenueAdjustment_effectiveOn_idx" ON "BusinessRevenueAdjustment"("effectiveOn");

DO $$ BEGIN
  ALTER TABLE "BusinessRevenueAdjustment"
    ADD CONSTRAINT "BusinessRevenueAdjustment_businessOrderId_fkey"
    FOREIGN KEY ("businessOrderId") REFERENCES "BusinessOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
