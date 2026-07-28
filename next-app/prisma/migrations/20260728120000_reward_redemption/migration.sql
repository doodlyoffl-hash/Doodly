-- Reward Redemption — single-use claimable rewards (puzzle winners etc.).
-- Fully additive: one new enum + one new table, no drops, no data loss.
-- No FK constraints (the app enforces integrity; keeps cascade behaviour simple).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RewardStatus" AS ENUM ('ISSUED', 'REDEEMED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RewardRedemption" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "campaignName" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "productSlug" TEXT NOT NULL DEFAULT 'milk',
  "variantMl" INTEGER NOT NULL DEFAULT 1000,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "planSlug" TEXT NOT NULL DEFAULT 'p7',
  "winnerId" TEXT,
  "issuedToUserId" TEXT,
  "status" "RewardStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "redeemedByUserId" TEXT,
  "subscriptionId" TEXT,
  "createdById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RewardRedemption_code_key" ON "RewardRedemption"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardRedemption_token_key" ON "RewardRedemption"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "RewardRedemption_subscriptionId_key" ON "RewardRedemption"("subscriptionId");
CREATE INDEX IF NOT EXISTS "RewardRedemption_status_idx" ON "RewardRedemption"("status");
CREATE INDEX IF NOT EXISTS "RewardRedemption_issuedToUserId_idx" ON "RewardRedemption"("issuedToUserId");
CREATE INDEX IF NOT EXISTS "RewardRedemption_winnerId_idx" ON "RewardRedemption"("winnerId");
