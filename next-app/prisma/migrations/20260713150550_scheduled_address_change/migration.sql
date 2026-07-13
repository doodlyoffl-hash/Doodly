-- Scheduled Address Change for active subscriptions (tenant-friendly).
-- Fully additive: one new enum, one new table, one nullable FK column + index on Delivery.
-- No drops, no data loss. Existing deliveries get addressId = NULL (address still resolves
-- live via the subscription until they are stamped/repointed).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AddressChangeStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable (delivery address snapshot — pins history)
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "addressId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledAddressChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "oldAddressId" TEXT NOT NULL,
    "newAddressId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "immediate" BOOLEAN NOT NULL DEFAULT false,
    "status" "AddressChangeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT,
    "requestedByRole" TEXT,
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "scheduledNotifiedAt" TIMESTAMP(3),
    "serviceabilityFailedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledAddressChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Delivery_addressId_idx" ON "Delivery"("addressId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledAddressChange_status_effectiveDate_idx" ON "ScheduledAddressChange"("status", "effectiveDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledAddressChange_subscriptionId_status_idx" ON "ScheduledAddressChange"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledAddressChange_userId_status_idx" ON "ScheduledAddressChange"("userId", "status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ScheduledAddressChange" ADD CONSTRAINT "ScheduledAddressChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ScheduledAddressChange" ADD CONSTRAINT "ScheduledAddressChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ScheduledAddressChange" ADD CONSTRAINT "ScheduledAddressChange_oldAddressId_fkey" FOREIGN KEY ("oldAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ScheduledAddressChange" ADD CONSTRAINT "ScheduledAddressChange_newAddressId_fkey" FOREIGN KEY ("newAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
