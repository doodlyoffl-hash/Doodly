-- Promotional-credit expiry engine: FIFO lots on the wallet ledger.
-- Additive + idempotent. expiresAt = deadline on an expirable CREDIT;
-- remainingPaise = its UNSPENT portion (spends consume oldest-expiry first);
-- expiredAt = stamped by the daily sweep when the unspent remainder is clawed back.
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "remainingPaise" INTEGER;
ALTER TABLE "WalletTxn" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WalletTxn_expiresAt_idx" ON "WalletTxn"("expiresAt");
