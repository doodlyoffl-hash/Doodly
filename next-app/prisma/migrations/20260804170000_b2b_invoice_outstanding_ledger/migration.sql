-- Business Invoice outstanding-ledger support (additive, idempotent).
-- Outstanding itself is ALWAYS computed (total − Σ payments); these only cache a derived date
-- and add an effective-payment-date for date-based reconciliation.
ALTER TABLE "BusinessInvoice" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);
ALTER TABLE "BusinessPayment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BusinessPayment_orderId_idx" ON "BusinessPayment"("orderId");
CREATE INDEX IF NOT EXISTS "BusinessPayment_paidAt_idx" ON "BusinessPayment"("paidAt");
CREATE INDEX IF NOT EXISTS "BusinessInvoice_clearedAt_idx" ON "BusinessInvoice"("clearedAt");
