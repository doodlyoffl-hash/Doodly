-- One feedback per customer per purchased product (verified reviews only).
-- Partial unique index: race-safe DB enforcement of the once-per-product rule
-- alongside the existing once-per-order guarantee. Fully additive.
CREATE UNIQUE INDEX IF NOT EXISTS "Review_userId_productSlug_verified_key"
  ON "Review"("userId", "productSlug")
  WHERE "productSlug" IS NOT NULL AND "orderId" IS NOT NULL;
