-- Wallet ledger hardening: traceability fields on WalletTxn + maker-checker queue.
-- Additive + idempotent.
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "WalletAdjustmentRequest" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "TxnType" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "requestedByRole" TEXT,
  "decidedById" TEXT,
  "decidedByRole" TEXT,
  "decidedAt" TIMESTAMP(3),
  "note" TEXT,
  "walletTxnId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletAdjustmentRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WalletAdjustmentRequest_code_key" ON "WalletAdjustmentRequest"("code");
CREATE INDEX IF NOT EXISTS "WalletAdjustmentRequest_status_createdAt_idx" ON "WalletAdjustmentRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletAdjustmentRequest_userId_createdAt_idx" ON "WalletAdjustmentRequest"("userId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "WalletAdjustmentRequest" ADD CONSTRAINT "WalletAdjustmentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
