/* POST /api/apple — Sign in with Apple (required for App Store review).

   Apple's guideline 4.8 makes "Sign in with Apple" mandatory for any iOS app
   that offers another third-party sign-in (we offer Google), so this is a
   release blocker, not a nice-to-have.

   Mirrors /api/google: verify, find-or-create, return the same bearer token.
   The one real difference is MATCHING. Apple lets users hide behind a
   per-app @privaterelay.appleid.com alias, so:
     1. match on appleSub  (stable, always present)
     2. else match on email (links an existing password/Google account)
     3. else create
   Matching on email first would create a duplicate account for anyone using
   private relay, and silently strand their orders on the old one. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { audit, recordLogin } from "@/lib/auth/audit";
import { verifyAppleIdentityToken } from "@/lib/auth/apple";
import { mintStorefrontToken } from "@/lib/auth/session-token";
import { isValidRoleKey } from "@/lib/auth/roles";
import { generateUniqueReferralCode } from "@/lib/referrals/service";
import { earn } from "@/lib/loyalty/service";
import { sendWelcomeEmail } from "@/lib/auth/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  identityToken: z.string().min(20).max(4000),
  /** Apple returns the real name ONLY on the first authorisation, so the app
   *  forwards it on that one call. There is no second chance to collect it. */
  fullName: z.string().trim().max(120).optional().nullable(),
});

const USER_SELECT = { id: true, name: true, email: true, role: true, status: true, deletedAt: true, tokenVersion: true, appleSub: true } as const;

export const POST = route("auth.apple", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`apple:${ctx.ip ?? "anon"}`, 10, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const { identityToken, fullName } = await parseBody(req, Body);

  const identity = await verifyAppleIdentityToken(identityToken);
  if (!identity) throw Errors.unauthorized("We couldn't verify your Apple account. Please try again.");

  // 1. the stable Apple id
  let user = await db.user.findUnique({ where: { appleSub: identity.sub }, select: USER_SELECT });
  let isNew = false;

  // 2. an existing account with this email — link it rather than duplicate
  if (!user && identity.email) {
    const byEmail = await db.user.findUnique({ where: { email: identity.email }, select: USER_SELECT });
    if (byEmail) {
      user = await db.user.update({
        where: { id: byEmail.id },
        data: { appleSub: identity.sub },
        select: USER_SELECT,
      });
    }
  }

  // 3. brand new customer
  if (!user) {
    const referralCode = await generateUniqueReferralCode();
    user = await db.user.create({
      data: {
        name: fullName || (identity.email ? identity.email.split("@")[0] : "DOODLY Customer"),
        // A private-relay alias still receives mail, so it's worth storing —
        // but only when Apple says it's verified.
        email: identity.email,
        emailVerified: identity.emailVerified ? new Date() : null,
        appleSub: identity.sub,
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
  await audit({ userId: user.id, actorRole: role, action: isNew ? "auth.apple_register" : "auth.apple_login", ctx });
  if (isNew) {
    await earn.registration(user.id).catch(() => {});
    // Don't email a private-relay alias a welcome — it works, but it reads as
    // spam to a user who deliberately hid their address.
    if (user.email && !identity.isPrivateEmail) {
      try { await sendWelcomeEmail(user.email, user.name); } catch { /* non-blocking */ }
    }
  }

  return ok({ token, expiresInDays, user: { id: user.id, name: user.name, email: user.email, role }, isNewAccount: isNew });
});
