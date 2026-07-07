-- Business Invoice email-delivery tracking (auto-send on creation via Resend).
-- Additive + nullable / defaulted columns → safe, non-destructive.
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "emailStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "emailTo" TEXT;
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3);
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT;
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "emailRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "emailError" TEXT;

CREATE INDEX IF NOT EXISTS "BusinessInvoice_emailStatus_idx" ON "BusinessInvoice"("emailStatus");
