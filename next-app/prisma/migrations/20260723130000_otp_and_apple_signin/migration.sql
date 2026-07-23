-- DOODLY — mobile sign-in: one-time passcodes + Sign in with Apple.
-- Additive only (one new nullable column, one new table), safe to apply live.

-- Sign in with Apple's stable subject id. Nullable: every existing account
-- predates Apple sign-in, and most will never use it.
ALTER TABLE "User" ADD COLUMN "appleSub" TEXT;
CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");

CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- Lookup path for verification: newest unconsumed code for a phone.
CREATE INDEX "OtpCode_phone_consumedAt_idx" ON "OtpCode"("phone", "consumedAt");
-- Sweep path for expiring old rows.
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");
