/* =============================================================
   OTP sign-in — the security properties, exercised against the real
   OtpCode table.

   A 6-digit code is the weakest credential in DOODLY, so these tests
   assert the controls that stop it being brute-forced or replayed, not
   just the happy path. Every test cleans up its own rows; the phone
   numbers used are reserved test numbers that can never collide with a
   real customer (the 9199999xxxx block is not issued in India).
   ============================================================= */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  issueOtp, verifyOtp, normalisePhone, isValidIndianMobile,
  MAX_ATTEMPTS, TTL_MS,
} from "@/lib/auth/otp";

const PHONE = "919199999001";
const PHONE2 = "919199999002";

async function wipe() {
  await db.otpCode.deleteMany({ where: { phone: { in: [PHONE, PHONE2] } } });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await db.$disconnect(); });

describe("phone normalisation", () => {
  it("adds the +91 country code to a bare 10-digit number", () => {
    expect(normalisePhone("9876543210")).toBe("919876543210");
  });
  it("leaves an already-prefixed number alone and strips punctuation", () => {
    expect(normalisePhone("+91 98765 43210")).toBe("919876543210");
  });
  it("rejects numbers that aren't valid Indian mobiles", () => {
    expect(isValidIndianMobile("1234567890")).toBe(false);   // must start 6-9
    expect(isValidIndianMobile("98765")).toBe(false);
    expect(isValidIndianMobile("9876543210")).toBe(true);
  });
});

describe("issuing", () => {
  it("stores the code HASHED, never in plaintext", async () => {
    const issued = await issueOtp(PHONE);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const row = await db.otpCode.findFirstOrThrow({ where: { phone: PHONE } });
    // The plaintext must appear nowhere in the row…
    expect(JSON.stringify(row)).not.toContain(issued.code);
    // …and the stored hash must be the salted digest we expect.
    expect(row.codeHash).toBe(createHash("sha256").update(`${issued.code}:${PHONE}`).digest("hex"));
  });

  it("issues a 6-digit numeric code", async () => {
    const issued = await issueOtp(PHONE);
    if (!issued.ok) throw new Error("expected issue to succeed");
    expect(issued.code).toMatch(/^\d{6}$/);
  });

  it("throttles an immediate resend", async () => {
    await issueOtp(PHONE);
    const second = await issueOtp(PHONE);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("too_soon");
      expect(second.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("supersedes the previous code so only one is ever live", async () => {
    const first = await issueOtp(PHONE);
    if (!first.ok) throw new Error("expected issue to succeed");

    // Age the first row past the resend window so a new one is allowed.
    await db.otpCode.updateMany({
      where: { phone: PHONE },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const second = await issueOtp(PHONE);
    expect(second.ok).toBe(true);

    // The OLD code must no longer work.
    const live = await db.otpCode.count({ where: { phone: PHONE, consumedAt: null } });
    expect(live).toBe(1);
    await expect(verifyOtp(PHONE, first.code)).resolves.toMatchObject({ ok: false });
  });
});

describe("verifying", () => {
  it("accepts the correct code exactly once", async () => {
    const issued = await issueOtp(PHONE);
    if (!issued.ok) throw new Error("expected issue to succeed");

    await expect(verifyOtp(PHONE, issued.code)).resolves.toEqual({ ok: true });
    // Replay must fail — a captured code can't be reused.
    await expect(verifyOtp(PHONE, issued.code)).resolves.toMatchObject({ ok: false, reason: "no_code" });
  });

  it("counts down attempts and burns the code at the cap", async () => {
    const issued = await issueOtp(PHONE);
    if (!issued.ok) throw new Error("expected issue to succeed");
    const wrong = issued.code === "000000" ? "111111" : "000000";

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const r = await verifyOtp(PHONE, wrong);
      expect(r).toMatchObject({ ok: false, reason: "mismatch" });
      if (!r.ok && r.reason === "mismatch") expect(r.attemptsLeft).toBe(MAX_ATTEMPTS - i);
    }

    // The final wrong guess exhausts the cap…
    const last = await verifyOtp(PHONE, wrong);
    expect(last).toMatchObject({ ok: false, attemptsLeft: 0 });

    // …and now even the RIGHT code is dead. This is the property that makes
    // a 6-digit code safe: an attacker gets 5 guesses, not 10^6.
    await expect(verifyOtp(PHONE, issued.code)).resolves.toMatchObject({ ok: false });
  });

  it("rejects an expired code", async () => {
    const issued = await issueOtp(PHONE);
    if (!issued.ok) throw new Error("expected issue to succeed");

    await db.otpCode.updateMany({
      where: { phone: PHONE, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(verifyOtp(PHONE, issued.code)).resolves.toMatchObject({ ok: false, reason: "expired" });
  });

  it("reports no_code when none was requested", async () => {
    await expect(verifyOtp(PHONE2, "123456")).resolves.toMatchObject({ ok: false, reason: "no_code" });
  });

  it("does not accept another number's code", async () => {
    const a = await issueOtp(PHONE);
    await issueOtp(PHONE2);
    if (!a.ok) throw new Error("expected issue to succeed");

    // Same digits, different phone → the hash is salted with the number, so
    // a code harvested from one handset is useless against another.
    const r = await verifyOtp(PHONE2, a.code);
    if (r.ok) throw new Error("a code must never verify against a different number");
  });

  it("expires codes within the advertised TTL", async () => {
    // Measured from when the REQUEST was made, which is what the user
    // experiences. Deliberately not expiresAt−createdAt: createdAt is stamped
    // by the database at INSERT, seconds after issueOtp() computed expiresAt,
    // so that difference understates the TTL by the network round-trip.
    const requestedAt = Date.now();
    const issued = await issueOtp(PHONE);
    if (!issued.ok) throw new Error("expected issue to succeed");

    const row = await db.otpCode.findFirstOrThrow({ where: { phone: PHONE, consumedAt: null } });
    const validFor = row.expiresAt.getTime() - requestedAt;

    expect(validFor).toBeLessThanOrEqual(TTL_MS);           // never longer than advertised
    expect(validFor).toBeGreaterThan(TTL_MS - 30_000);      // and not meaningfully shorter
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
