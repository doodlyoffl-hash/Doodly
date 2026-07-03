/* =============================================================
   DOODLY — Opaque single-use tokens (password reset, etc.)
   The raw token is returned ONCE (goes in the emailed link); only
   its SHA-256 hash is persisted, so a DB leak can't be replayed.
   ============================================================= */
import "server-only";
import { randomBytes, createHash } from "node:crypto";

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
