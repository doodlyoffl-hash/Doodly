-- Bottle recovery: track empties still outstanding when a subscription ends, so ops
-- can chase or write them off. Additive + idempotent.

DO $$ BEGIN
  CREATE TYPE "BottleRecoveryStatus" AS ENUM ('OPEN', 'RECOVERED', 'WRITTEN_OFF');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "BottleRecovery" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "subscriptionId" TEXT,
  "outstandingQty" INTEGER NOT NULL,
  "status"         "BottleRecoveryStatus" NOT NULL DEFAULT 'OPEN',
  "note"           TEXT,
  "openedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"       TIMESTAMP(3),
  "closedById"     TEXT,
  CONSTRAINT "BottleRecovery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BottleRecovery_status_idx" ON "BottleRecovery"("status");
CREATE INDEX IF NOT EXISTS "BottleRecovery_userId_idx" ON "BottleRecovery"("userId");

DO $$ BEGIN
  ALTER TABLE "BottleRecovery" ADD CONSTRAINT "BottleRecovery_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
