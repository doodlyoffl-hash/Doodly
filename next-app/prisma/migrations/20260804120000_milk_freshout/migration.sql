-- Freshout Milk — extra litres from the SAME tanker after it reads empty (additive, idempotent).
-- Not a new procurement: enlarges the lot's usable stock at the same total cost.
ALTER TABLE "MilkTanker" ADD COLUMN IF NOT EXISTS "freshoutKg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "MilkTanker" ADD COLUMN IF NOT EXISTS "freshoutLitres" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "TankerClosingReport" ADD COLUMN IF NOT EXISTS "freshoutKg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "TankerClosingReport" ADD COLUMN IF NOT EXISTS "freshoutLitres" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MilkTankerFreshout" (
  "id" TEXT NOT NULL,
  "tankerId" TEXT NOT NULL,
  "quantityKg" DOUBLE PRECISION NOT NULL,
  "litres" DOUBLE PRECISION NOT NULL,
  "conversionFactor" DOUBLE PRECISION NOT NULL,
  "enteredById" TEXT,
  "remarks" TEXT,
  "entryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MilkTankerFreshout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MilkTankerFreshout_tankerId_idx" ON "MilkTankerFreshout"("tankerId");

DO $$ BEGIN
  ALTER TABLE "MilkTankerFreshout"
    ADD CONSTRAINT "MilkTankerFreshout_tankerId_fkey"
    FOREIGN KEY ("tankerId") REFERENCES "MilkTanker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
