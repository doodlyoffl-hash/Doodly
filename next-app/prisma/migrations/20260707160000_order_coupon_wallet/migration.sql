-- Checkout coupon + wallet applied to a customer Order (recorded for the payment
-- summary / invoice / rollback). Additive + defaulted → safe, non-destructive.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponDiscountPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "walletAppliedPaise" INTEGER NOT NULL DEFAULT 0;
