-- CreateEnum
CREATE TYPE "ContinuityType" AS ENUM ('PRIMARY', 'CONTINUITY');

-- AlterTable
ALTER TABLE "MilkTanker" ADD COLUMN     "continuityChainId" TEXT,
ADD COLUMN     "continuitySequence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "continuityType" "ContinuityType" NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN     "parentTankerId" TEXT;

-- CreateTable
CREATE TABLE "MilkOrderAllocation" (
    "id" TEXT NOT NULL,
    "tankerId" TEXT NOT NULL,
    "tankerCode" TEXT NOT NULL,
    "continuityChainId" TEXT,
    "channel" "ConsumptionChannel" NOT NULL,
    "orderRef" TEXT NOT NULL,
    "orderLabel" TEXT,
    "partyName" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "costPaise" INTEGER NOT NULL,
    "revenuePaise" INTEGER,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkOrderAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilkOrderAllocation_orderRef_idx" ON "MilkOrderAllocation"("orderRef");

-- CreateIndex
CREATE INDEX "MilkOrderAllocation_tankerId_idx" ON "MilkOrderAllocation"("tankerId");

-- CreateIndex
CREATE INDEX "MilkOrderAllocation_continuityChainId_idx" ON "MilkOrderAllocation"("continuityChainId");

-- CreateIndex
CREATE UNIQUE INDEX "MilkOrderAllocation_tankerId_channel_orderRef_key" ON "MilkOrderAllocation"("tankerId", "channel", "orderRef");

-- CreateIndex
CREATE INDEX "MilkTanker_continuityChainId_idx" ON "MilkTanker"("continuityChainId");

