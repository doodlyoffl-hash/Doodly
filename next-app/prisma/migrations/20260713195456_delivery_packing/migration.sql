-- Packing workflow: a warehouse packing stage per delivery, ops-managed, independent
-- of the executive delivery status. Fully additive: one new enum + 3 nullable/defaulted
-- columns on Delivery. No drops, no data loss (existing deliveries default to PENDING).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PackingStatus" AS ENUM ('PENDING', 'PACKING', 'PACKED', 'READY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "packingStatus" "PackingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "packedAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "packedById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Delivery_packingStatus_date_idx" ON "Delivery"("packingStatus", "date");
