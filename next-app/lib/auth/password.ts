/* =============================================================
   DOODLY — Password hashing & strength validation
   bcryptjs (pure-JS, no native build) so it runs on every host.
   Only ever store the hash; never log or return the raw password.
   ============================================================= */
import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/* Shared password policy — the SINGLE source of truth for every place a new
   password is set (register, reset-password, change-password, admin-created
   staff/drivers). The storefront's client-side checklist in assets/js/auth.js
   mirrors these exact rules so the two never disagree (that mismatch was the
   old "password error on sign-up" bug: the form accepted 6 chars, the server
   demanded 8 + letter + number, and the rejection surfaced as a raw error).
   Each rule is its own .refine so the failing message is specific.
   NOTE: only NEW passwords are validated here — sign-in (/api/token) merely
   bcrypt-compares, so tightening this never locks out an existing account. */
export const PW_MIN = 8;
export const passwordSchema = z
  .string()
  .min(PW_MIN, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer") // bcrypt truncates beyond 72 bytes
  .refine((v) => /[A-Z]/.test(v), { message: "Password must include an uppercase letter" })
  .refine((v) => /[a-z]/.test(v), { message: "Password must include a lowercase letter" })
  .refine((v) => /[0-9]/.test(v), { message: "Password must include a number" })
  .refine((v) => /[^A-Za-z0-9]/.test(v), { message: "Password must include a special character" });
