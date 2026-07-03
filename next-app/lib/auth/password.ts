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

/** Shared password policy: >= 8 chars, at least one letter and one number. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer") // bcrypt truncates beyond 72 bytes
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: "Password must include at least one letter and one number",
  });
