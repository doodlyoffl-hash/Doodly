-- Order → Delivery bridge. Fully additive: nullable columns + one unique index +
-- two FKs. No drops, no data loss. Lets a one-time order carry its own delivery
-- address/date/slot so it can become a Delivery on payment, and links a checkout
-- subscription back to the order that created it.

-- AlterTable: Order carries its delivery details (previously had none of its own)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "addressId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliverySlot" TEXT;

-- AlterTable: Subscription ← the order that spawned it
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_orderId_key" ON "Subscription"("orderId");
CREATE INDEX IF NOT EXISTS "Order_addressId_idx" ON "Order"("addressId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
