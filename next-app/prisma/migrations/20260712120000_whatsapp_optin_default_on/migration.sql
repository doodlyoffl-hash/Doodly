-- Transactional WhatsApp opt-in defaults ON (owner decision, 2026-07-12).
-- Customers can still opt out anytime from account settings; the dispatch
-- consent gate keeps honouring the stored value on every send.
ALTER TABLE "CustomerPreference" ALTER COLUMN "whatsappOptIn" SET DEFAULT true;
-- Backfill the existing default-created rows (1 row at migration time; none
-- were explicit opt-outs — WhatsApp had never sent before this date).
UPDATE "CustomerPreference" SET "whatsappOptIn" = true WHERE "whatsappOptIn" = false;
