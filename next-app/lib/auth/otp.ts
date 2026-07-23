/* =============================================================
   DOODLY — one-time passcode sign-in (mobile apps).

   A 6-digit code is the weakest credential in the system, so every
   control here exists to stop it being brute-forced or replayed:

     • STORED HASHED. sha256(code + phone) — a database leak yields no
       usable codes, and salting with the phone stops one rainbow table
       covering every row.
     • SINGLE USE. consumedAt is stamped on the first successful verify.
     • ATTEMPT CAPPED. MAX_ATTEMPTS wrong guesses burns the code; a
       6-digit space needs far more tries than that to be worth guessing.
     • RESEND THROTTLED. One code per RESEND_WINDOW, and a hard ceiling
       per phone per hour, so the endpoint can't be used to spam somebody
       else's handset (or run up an SMS bill).
     • SUPERSEDING. Requesting a new code consumes the previous one, so
       two live codes never exist for one number.

   Verification NEVER says whether the number is registered — that would
   turn this into a "is X a DOODLY customer" oracle.
   ============================================================= */
import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const CODE_LENGTH = 6;
export const TTL_MS = 5 * 60_000;             // a code is valid for 5 minutes
export const RESEND_WINDOW_MS = 60_000;       // one code per minute per phone
export const MAX_ATTEMPTS = 5;
export const MAX_PER_HOUR = 5;                // hard ceiling per phone

/** Salted with the phone so one precomputed table can't cover every row. */
function hashCode(code: string, phone: string): string {
  return createHash("sha256").update(`${code}:${phone}`).digest("hex");
}

/** Constant-time compare — a plain === leaks the matching prefix length
 *  through timing, which measurably narrows a 6-digit search. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** E.164 digits without the plus: 10-digit Indian numbers gain 91. */
export function normalisePhone(input: string): string {
  const d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 13 && d.startsWith("091")) return d.slice(1);
  return d;
}

export function isValidIndianMobile(input: string): boolean {
  return /^91[6-9]\d{9}$/.test(normalisePhone(input));
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date; retryAfterSec: number }
  | { ok: false; reason: "too_soon" | "too_many"; retryAfterSec: number };

/**
 * Create a code for `phone`. Returns the PLAINTEXT code for the caller to
 * send by SMS — it is never persisted and never returned over HTTP.
 */
export async function issueOtp(phone: string, ip?: string | null): Promise<IssueResult> {
  const now = new Date();

  // Throttle: one per window, and a ceiling per hour.
  const recent = await db.otpCode.findFirst({
    where: { phone, purpose: "login" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) {
    const age = now.getTime() - recent.createdAt.getTime();
    if (age < RESEND_WINDOW_MS) {
      return { ok: false, reason: "too_soon", retryAfterSec: Math.ceil((RESEND_WINDOW_MS - age) / 1000) };
    }
  }

  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const sentThisHour = await db.otpCode.count({ where: { phone, createdAt: { gte: hourAgo } } });
  if (sentThisHour >= MAX_PER_HOUR) {
    return { ok: false, reason: "too_many", retryAfterSec: 3600 };
  }

  // Only one live code per number.
  await db.otpCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: now },
  });

  // randomInt is CSPRNG-backed; Math.random() would be predictable.
  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  const expiresAt = new Date(now.getTime() + TTL_MS);

  await db.otpCode.create({
    data: { phone, codeHash: hashCode(code, phone), expiresAt, ip: ip ?? null },
  });

  return { ok: true, code, expiresAt, retryAfterSec: Math.ceil(RESEND_WINDOW_MS / 1000) };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "mismatch"; attemptsLeft?: number };

/** Check a code and consume it on success. */
export async function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  const now = new Date();
  const row = await db.otpCode.findFirst({
    where: { phone, purpose: "login", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "no_code" };

  if (row.expiresAt.getTime() < now.getTime()) {
    await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: now } });
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: now } });
    return { ok: false, reason: "too_many_attempts" };
  }

  const supplied = String(code ?? "").replace(/\D/g, "");
  if (!safeEqual(hashCode(supplied, phone), row.codeHash)) {
    const updated = await db.otpCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = Math.max(0, MAX_ATTEMPTS - updated.attempts);
    // Burn the code the moment the cap is reached, rather than leaving a
    // dead row that still answers "mismatch" to further guesses.
    if (left === 0) await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: now } });
    return { ok: false, reason: "mismatch", attemptsLeft: left };
  }

  await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: now } });
  return { ok: true };
}

/** Housekeeping — drop consumed/expired rows older than a day. Called from
 *  the daily cron; the table is otherwise unbounded. */
export async function purgeOldOtps(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const r = await db.otpCode.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}
