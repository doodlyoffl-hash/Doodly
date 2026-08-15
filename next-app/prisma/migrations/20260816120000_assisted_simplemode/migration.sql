-- Assisted Ordering + Senior-Friendly Simple Mode (additive, idempotent).
-- Order provenance/channel + assisted-order staff + consent; Payment link id; Simple Mode pref.
-- All columns are nullable or defaulted so existing rows + the self-serve flow are unchanged.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'website';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "placedById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "placedByRole" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assistConsentAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Order_source_createdAt_idx" ON "Order" ("source", "createdAt");

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "razorpayLinkId" TEXT;

ALTER TABLE "CustomerPreference" ADD COLUMN IF NOT EXISTS "simpleMode" BOOLEAN NOT NULL DEFAULT false;
