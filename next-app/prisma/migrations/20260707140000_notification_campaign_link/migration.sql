-- Link per-recipient Notification rows to their marketing campaign, so a
-- NotificationCampaign has real delivery logs + analytics + retry.
-- Additive + nullable / defaulted → safe, non-destructive.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Notification_campaignId_idx" ON "Notification"("campaignId");
