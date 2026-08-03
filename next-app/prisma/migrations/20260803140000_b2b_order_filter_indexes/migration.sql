-- B2B Orders server-side filter/sort performance indexes (additive, idempotent).
CREATE INDEX IF NOT EXISTS "BusinessOrder_createdAt_idx" ON "BusinessOrder"("createdAt");
CREATE INDEX IF NOT EXISTS "BusinessOrder_updatedAt_idx" ON "BusinessOrder"("updatedAt");
CREATE INDEX IF NOT EXISTS "BusinessOrder_totalPaise_idx" ON "BusinessOrder"("totalPaise");
CREATE INDEX IF NOT EXISTS "BusinessOrder_revenuePaise_idx" ON "BusinessOrder"("revenuePaise");
