/* POST /api/google — customer sign-in with Google (storefront, cross-origin).
   The browser gets a Google access token via Google Identity Services and posts
   it here; we verify it with Google, find-or-create the customer by their
   Google-verified email, and return a DOODLY bearer token — the same shape as
   /api/token, so the storefront signs in identically. Deliberately NOT under
   /api/auth/* so the middleware attaches CORS for the static site. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { audit, recordLogin } from "@/lib/auth/audit";
import { fetchGoogleUser } from "@/lib/auth/google";
import { mintStorefrontToken } from "@/lib/auth/session-token";
import { isValidRoleKey } from "@/lib/auth/roles";
import { generateUniqueReferralCode } from "@/lib/referrals/service";
import { earn } from "@/lib/loyalty/service";
import { sendWelcomeEmail } from "@/lib/auth/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ accessToken: z.string().min(1).max(4000) });

const USER_SELECT = { id: true, name: true, email: true, role: true, status: true, deletedAt: true, tokenVersion: true } as const;

export const POST = route("auth.google", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`google:${ctx.ip ?? "anon"}`, 10, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const { accessToken } = await parseBody(req, Body);

  const gu = await fetchGoogleUser(accessToken);
  if (!gu) throw Errors.unauthorized("We couldn't verify your Google account. Please try again.");

  let user = await db.user.findUnique({ where: { email: gu.email }, select: USER_SELECT });
  let isNew = false;
  if (!user) {
    // First time this Google email signs in → create a customer account. No
    // password (they use Google), email pre-verified by Google, referral code
    // generated like a normal sign-up.
    const referralCode = await generateUniqueReferralCode();
    user = await db.user.create({
      data: {
        name: gu.name || gu.email.split("@")[0],
        email: gu.email,
        role: "CUSTOMER",
        emailVerified: new Date(),
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
  await audit({ userId: user.id, actorRole: role, action: isNew ? "auth.google_register" : "auth.google_login", ctx });
  if (isNew) {
    await earn.registration(user.id).catch(() => {});                 // loyalty welcome points
    if (user.email) { try { await sendWelcomeEmail(user.email, user.name); } catch { /* non-blocking */ } }
  }

  return ok({ token, expiresInDays, user: { id: user.id, name: user.name, email: user.email, role } });
});
