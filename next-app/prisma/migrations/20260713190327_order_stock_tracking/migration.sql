-- Inventory: track which variant + how many bottles an order consumes, and mark
-- when its stock was decremented (idempotency). Fully additive: 3 nullable/defaulted
-- columns on Order. No drops, no data loss.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockVariantId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockUnits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockCommittedAt" TIMESTAMP(3);
