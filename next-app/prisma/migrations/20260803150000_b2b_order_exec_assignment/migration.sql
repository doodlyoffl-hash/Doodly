-- B2B order → delivery-executive assignment (additive, idempotent).
ALTER TABLE "BusinessOrder" ADD COLUMN IF NOT EXISTS "driverId" TEXT;
ALTER TABLE "BusinessOrder" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "BusinessOrder" ADD COLUMN IF NOT EXISTS "assignmentMode" TEXT;
CREATE INDEX IF NOT EXISTS "BusinessOrder_driverId_idx" ON "BusinessOrder"("driverId");
DO $$ BEGIN
  ALTER TABLE "BusinessOrder" ADD CONSTRAINT "BusinessOrder_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
