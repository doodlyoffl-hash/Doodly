/* POST /api/otp/verify — exchange a valid code for a DOODLY bearer token.

   Returns exactly the same shape as /api/token and /api/google, so the apps
   treat every sign-in path identically.

   First sign-in from an unknown number CREATES a customer account. That is
   safe here and only here: possession of the number has just been proven by
   the code, which is the same standard the rest of the Indian D2C market
   uses. Staff and delivery-executive accounts are never created this way —
   they're provisioned by an admin, and an existing account keeps whatever
   role it already has. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { audit, recordLogin } from "@/lib/auth/audit";
import { verifyOtp, normalisePhone, isValidIndianMobile } from "@/lib/auth/otp";
import { mintStorefrontToken } from "@/lib/auth/session-token";
import { isValidRoleKey } from "@/lib/auth/roles";
import { generateUniqueReferralCode } from "@/lib/referrals/service";
import { earn } from "@/lib/loyalty/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  phone: z.string().trim().min(8).max(20),
  code: z.string().trim().min(4).max(8),
});

const USER_SELECT = { id: true, name: true, email: true, phone: true, role: true, status: true, deletedAt: true, tokenVersion: true } as const;

export const POST = route("auth.otp.verify", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`otp-verify:${ctx.ip ?? "anon"}`, 20, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const body = await parseBody(req, Body);
  if (!isValidIndianMobile(body.phone)) throw Errors.badRequest("Enter a valid 10-digit mobile number.");
  const phone = normalisePhone(body.phone);

  const result = await verifyOtp(phone, body.code);
  if (!result.ok) {
    // Log the failure against the account if one exists, so the same
    // brute-force signals feed the existing LoginHistory guard.
    const existing = await db.user.findUnique({ where: { phone }, select: { id: true } });
    await recordLogin({ userId: existing?.id ?? null, success: false, ctx });

    switch (result.reason) {
      case "no_code": throw Errors.badRequest("Request a code first.");
      case "expired": throw Errors.badRequest("That code has expired. Request a new one.");
      case "too_many_attempts": throw Errors.tooMany("Too many incorrect attempts. Request a new code.");
      default:
        throw Errors.unauthorized(
          result.attemptsLeft && result.attemptsLeft > 0
            ? `Incorrect code. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`
            : "Incorrect code. Request a new one.",
        );
    }
  }

  let user = await db.user.findUnique({ where: { phone }, select: USER_SELECT });
  let isNew = false;

  if (!user) {
    const referralCode = await generateUniqueReferralCode();
    user = await db.user.create({
      data: {
        // The number is the only thing we know; the customer names themselves
        // later in Profile. Storing the digits as a name reads badly in the UI.
        name: "DOODLY Customer",
        phone,
        role: "CUSTOMER",
        referralCode,
      },
      select: USER_SELECT,
    });
    isNew = true;
  }

  if (user.status !== "ACTIVE" || user.deletedAt) {
    throw Errors.forbidden("This account isn't active. Please contact support.");
  }

  const role = isValidRoleKey(String(user.role).toLowerCase()) ? String(user.role).toLowerCase() : "customer";
  const { token, expiresInDays } = await mintStorefrontToken({ id: user.id, role, tokenVersion: user.tokenVersion });

  await recordLogin({ userId: user.id, success: true, ctx });
  await audit({ userId: user.id, actorRole: role, action: isNew ? "auth.otp_register" : "auth.otp_login", ctx });
  if (isNew) await earn.registration(user.id).catch(() => {});

  return ok({
    token, expiresInDays,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role },
    isNewAccount: isNew,
  });
});
