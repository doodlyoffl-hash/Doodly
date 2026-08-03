-- B2B invoice WhatsApp delivery tracking (additive, idempotent).
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "whatsappStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "whatsappTo" TEXT;
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "whatsappSentAt" TIMESTAMP(3);
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "whatsappMessageId" TEXT;
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "whatsappRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "whatsappError" TEXT;
