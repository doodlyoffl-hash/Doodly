-- Performance indexes on hot query paths (delivery lists, unread notifications,
-- customer subscription lookups, driver day-views).

-- CreateIndex
CREATE INDEX "Delivery_date_status_idx" ON "Delivery"("date", "status");

-- CreateIndex
CREATE INDEX "Delivery_subscriptionId_date_idx" ON "Delivery"("subscriptionId", "date");

-- CreateIndex
CREATE INDEX "Delivery_driverId_date_idx" ON "Delivery"("driverId", "date");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");
