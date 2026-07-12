-- Review moderation for the public Reviews & Ratings module. Fully additive:
-- nullable/defaulted columns + one index. Existing reviews become PENDING
-- (nothing goes public until an admin approves — no demo/fake data can leak).
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "productSlug" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "reply" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "moderatedBy" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Review_status_rating_featured_createdAt_idx" ON "Review"("status", "rating", "featured", "createdAt");
