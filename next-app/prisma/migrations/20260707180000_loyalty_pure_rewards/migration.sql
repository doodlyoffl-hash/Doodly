-- DOODLY Pure Rewards — loyalty programme
-- Fully additive: new defaulted columns on User + two new tables (LoyaltyConfig, LoyaltyLedger).
-- No drops, no data loss. Existing rows get the column defaults.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "loyaltyLifetimeEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyLifetimeRedeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoyaltyConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerHundred" INTEGER NOT NULL DEFAULT 10,
    "earnRegistration" INTEGER NOT NULL DEFAULT 50,
    "earnProfile" INTEGER NOT NULL DEFAULT 25,
    "earnSubscribe30" INTEGER NOT NULL DEFAULT 300,
    "earnSubscribe90" INTEGER NOT NULL DEFAULT 1000,
    "earnReferral" INTEGER NOT NULL DEFAULT 500,
    "earnBottleReturn" INTEGER NOT NULL DEFAULT 15,
    "earnRenewal" INTEGER NOT NULL DEFAULT 150,
    "earnStreak12" INTEGER NOT NULL DEFAULT 200,
    "earnBirthday" INTEGER NOT NULL DEFAULT 250,
    "earnAnniversary" INTEGER NOT NULL DEFAULT 1000,
    "earnPuzzlePlay" INTEGER NOT NULL DEFAULT 50,
    "earnPuzzleWin" INTEGER NOT NULL DEFAULT 2500,
    "earnReview" INTEGER NOT NULL DEFAULT 30,
    "redeemPointsPerRupee" INTEGER NOT NULL DEFAULT 10,
    "minRedeemPoints" INTEGER NOT NULL DEFAULT 100,
    "expiryDays" INTEGER NOT NULL DEFAULT 365,
    "remindDays" INTEGER[] DEFAULT ARRAY[30, 7]::INTEGER[],
    "tiers" JSONB,
    "campaignMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "campaignEndsAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "orderId" TEXT,
    "subscriptionId" TEXT,
    "walletTxnId" TEXT,
    "reversedId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedger_reference_key" ON "LoyaltyLedger"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedger_reversedId_key" ON "LoyaltyLedger"("reversedId");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_userId_createdAt_idx" ON "LoyaltyLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_userId_type_expiresAt_idx" ON "LoyaltyLedger"("userId", "type", "expiresAt");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_kind_createdAt_idx" ON "LoyaltyLedger"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
