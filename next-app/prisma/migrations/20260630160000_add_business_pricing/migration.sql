-- CreateTable
CREATE TABLE "BusinessPricing" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT,
    "unit" TEXT NOT NULL,
    "basePricePaise" INTEGER NOT NULL,
    "b2bPricePaise" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL DEFAULT 0,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPricingHistory" (
    "id" TEXT NOT NULL,
    "pricingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldB2bPaise" INTEGER,
    "newB2bPaise" INTEGER NOT NULL,
    "oldGstBps" INTEGER,
    "newGstBps" INTEGER NOT NULL,
    "reason" TEXT,
    "byId" TEXT,
    "byRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessPricingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessPricing_code_key" ON "BusinessPricing"("code");

-- CreateIndex
CREATE INDEX "BusinessPricing_businessId_productSlug_idx" ON "BusinessPricing"("businessId", "productSlug");

-- CreateIndex
CREATE INDEX "BusinessPricing_productSlug_idx" ON "BusinessPricing"("productSlug");

-- CreateIndex
CREATE INDEX "BusinessPricing_active_deletedAt_idx" ON "BusinessPricing"("active", "deletedAt");

-- CreateIndex
CREATE INDEX "BusinessPricingHistory_pricingId_createdAt_idx" ON "BusinessPricingHistory"("pricingId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessPricing" ADD CONSTRAINT "BusinessPricing_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPricingHistory" ADD CONSTRAINT "BusinessPricingHistory_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "BusinessPricing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

