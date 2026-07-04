-- Cross-instance login rate-limiting: index failed-attempt lookups by IP + time.
CREATE INDEX IF NOT EXISTS "LoginHistory_ip_createdAt_idx" ON "LoginHistory"("ip", "createdAt");
