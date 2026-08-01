-- B2B order line: record WHICH quantity-slab tier priced it (for invoices + audit).
-- Additive + idempotent; existing lines stay NULL (catalogue default / pre-slab).
ALTER TABLE "BusinessOrderItem" ADD COLUMN IF NOT EXISTS "slabMinQty" INTEGER;
ALTER TABLE "BusinessOrderItem" ADD COLUMN IF NOT EXISTS "pricingCode" TEXT;
