-- Verified product reviews: link a Review to the delivered Order it reviews.
-- Fully additive — one nullable column + unique index (one review per order;
-- existing rows keep NULL, which the unique index permits) + a list index.

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_userId_createdAt_idx" ON "Review"("userId", "createdAt");
