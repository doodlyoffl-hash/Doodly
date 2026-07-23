-- DOODLY — push notification device registry (mobile apps).
-- Additive only: one new table, no changes to existing columns, so this is
-- safe to apply to production while the site is serving traffic.

CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- The push provider re-issues the SAME token to whoever reinstalls the app on
-- a given device. Uniqueness lets registration MOVE the row to the new user
-- instead of creating a duplicate that would keep notifying the old owner.
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

CREATE INDEX "DeviceToken_userId_disabledAt_idx" ON "DeviceToken"("userId", "disabledAt");
CREATE INDEX "DeviceToken_app_disabledAt_idx" ON "DeviceToken"("app", "disabledAt");

-- Cascade: a deleted user's device rows are meaningless and must not linger
-- as orphans that could be re-associated by a token collision.
ALTER TABLE "DeviceToken"
    ADD CONSTRAINT "DeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
