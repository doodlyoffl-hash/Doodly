-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsumptionChannel" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "ConsumptionChannel" ADD VALUE IF NOT EXISTS 'OUTLET';

-- CreateTable
CREATE TABLE "WarehouseCustomer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "gst" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseCustomerPricing" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseCustomerPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseSale" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "litres" DOUBLE PRECISION NOT NULL,
    "pricePerLitrePaise" INTEGER NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "paidPaise" INTEGER NOT NULL DEFAULT 0,
    "paymentMode" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "notes" TEXT,
    "soldById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOutlet" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "contactPerson" TEXT,
    "mobile" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailOutlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletPricing" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutletPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletSale" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "outletName" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "litres" DOUBLE PRECISION NOT NULL,
    "pricePerLitrePaise" INTEGER NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "paidPaise" INTEGER NOT NULL DEFAULT 0,
    "paymentMode" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "notes" TEXT,
    "soldById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutletSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCustomer_code_key" ON "WarehouseCustomer"("code");

-- CreateIndex
CREATE INDEX "WarehouseCustomer_active_deletedAt_idx" ON "WarehouseCustomer"("active", "deletedAt");

-- CreateIndex
CREATE INDEX "WarehouseCustomerPricing_customerId_active_effectiveFrom_idx" ON "WarehouseCustomerPricing"("customerId", "active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSale_code_key" ON "WarehouseSale"("code");

-- CreateIndex
CREATE INDEX "WarehouseSale_saleDate_status_idx" ON "WarehouseSale"("saleDate", "status");

-- CreateIndex
CREATE INDEX "WarehouseSale_customerId_saleDate_idx" ON "WarehouseSale"("customerId", "saleDate");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOutlet_code_key" ON "RetailOutlet"("code");

-- CreateIndex
CREATE INDEX "RetailOutlet_active_deletedAt_idx" ON "RetailOutlet"("active", "deletedAt");

-- CreateIndex
CREATE INDEX "OutletPricing_outletId_active_effectiveFrom_idx" ON "OutletPricing"("outletId", "active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "OutletSale_code_key" ON "OutletSale"("code");

-- CreateIndex
CREATE INDEX "OutletSale_saleDate_status_idx" ON "OutletSale"("saleDate", "status");

-- CreateIndex
CREATE INDEX "OutletSale_outletId_saleDate_idx" ON "OutletSale"("outletId", "saleDate");

-- AddForeignKey
ALTER TABLE "WarehouseCustomerPricing" ADD CONSTRAINT "WarehouseCustomerPricing_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "WarehouseCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseSale" ADD CONSTRAINT "WarehouseSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "WarehouseCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletPricing" ADD CONSTRAINT "OutletPricing_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "RetailOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletSale" ADD CONSTRAINT "OutletSale_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "RetailOutlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

