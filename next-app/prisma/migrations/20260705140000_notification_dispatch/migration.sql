-- AlterTable: external dispatch tracking on Notification
ALTER TABLE "Notification" ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "providerLog" TEXT,
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "providerStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Notification_providerStatus_idx" ON "Notification"("providerStatus");

-- Backfill: every notification that existed before this feature is already
-- "handled" (it was created in-app only). Mark them SKIPPED so the new drain
-- never retro-sends the historical backlog as SMS/WhatsApp/Email. Only rows
-- created from here on default to PENDING and get dispatched.
UPDATE "Notification" SET "providerStatus" = 'SKIPPED' WHERE "providerStatus" = 'PENDING';
