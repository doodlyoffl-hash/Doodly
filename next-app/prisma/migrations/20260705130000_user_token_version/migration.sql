-- Instant session revocation: per-user token version. Bumping it invalidates
-- every bearer token that carries an older version (logout / password change).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
