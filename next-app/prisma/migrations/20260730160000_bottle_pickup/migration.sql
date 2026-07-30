-- Bottle-return pickup + deposit refund workflow. Customer-initiated final-bottle
-- pickup after a subscription ends → exec collects → deposit auto-refunds to wallet.
-- Additive + idempotent.

-- enums
DO $$ BEGIN
  CREATE TYPE "DeliveryKind" AS ENUM ('DELIVERY', 'PICKUP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "BottlePickupStatus" AS ENUM ('REQUESTED','SCHEDULED','ASSIGNED','IN_PROGRESS','COLLECTED','VERIFIED','REFUNDED','CLOSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Delivery: direct customer link + kind discriminator (for non-sub/order pickups)
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "kind" "DeliveryKind" NOT NULL DEFAULT 'DELIVERY';
CREATE INDEX IF NOT EXISTS "Delivery_userId_idx" ON "Delivery"("userId");

DO $$ BEGIN
  ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- BottlePickupRequest
CREATE TABLE IF NOT EXISTS "BottlePickupRequest" (
  "id"                     TEXT NOT NULL,
  "userId"                 TEXT NOT NULL,
  "addressId"              TEXT,
  "subscriptionId"         TEXT,
  "status"                 "BottlePickupStatus" NOT NULL DEFAULT 'REQUESTED',
  "bottlesExpected"        INTEGER NOT NULL,
  "bottlesCollected"       INTEGER NOT NULL DEFAULT 0,
  "bottlesMissing"         INTEGER NOT NULL DEFAULT 0,
  "bottlesBroken"          INTEGER NOT NULL DEFAULT 0,
  "depositPerBottlePaise"  INTEGER NOT NULL,
  "refundableDepositPaise" INTEGER NOT NULL,
  "refundedPaise"          INTEGER NOT NULL DEFAULT 0,
  "walletTxnRef"           TEXT,
  "preferredDate"          TIMESTAMP(3),
  "preferredSlot"          TEXT,
  "customerNote"           TEXT,
  "execRemark"             TEXT,
  "deliveryId"             TEXT,
  "driverId"               TEXT,
  "requestedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledAt"            TIMESTAMP(3),
  "assignedAt"             TIMESTAMP(3),
  "collectedAt"            TIMESTAMP(3),
  "verifiedAt"             TIMESTAMP(3),
  "refundedAt"             TIMESTAMP(3),
  "closedAt"               TIMESTAMP(3),
  "verifiedById"           TEXT,
  "closedById"             TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BottlePickupRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BottlePickupRequest_deliveryId_key" ON "BottlePickupRequest"("deliveryId");
CREATE INDEX IF NOT EXISTS "BottlePickupRequest_userId_status_idx" ON "BottlePickupRequest"("userId", "status");
CREATE INDEX IF NOT EXISTS "BottlePickupRequest_status_requestedAt_idx" ON "BottlePickupRequest"("status", "requestedAt");

DO $$ BEGIN
  ALTER TABLE "BottlePickupRequest" ADD CONSTRAINT "BottlePickupRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BottlePickupRequest" ADD CONSTRAINT "BottlePickupRequest_addressId_fkey"
    FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BottlePickupRequest" ADD CONSTRAINT "BottlePickupRequest_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "BottlePickupRequest" ADD CONSTRAINT "BottlePickupRequest_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
