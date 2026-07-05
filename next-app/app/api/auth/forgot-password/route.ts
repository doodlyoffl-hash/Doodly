/* POST /api/auth/forgot-password — start a password reset.
   Always returns the same generic 200 (no account enumeration). When the
   email matches an active account, a single-use token (1h) is stored as a
   hash and the raw token is emailed as a reset link. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { generateToken, hashToken, RESET_TOKEN_TTL_MS } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/email";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/ratelimit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email") });

const GENERIC = "If an account exists for that email, we've sent a reset link.";

// The reset link must land on the STOREFRONT (static app), NEVER this backend
// (it has no /reset-password.html → 404). NOTE: we intentionally do NOT use
// NEXT_PUBLIC_SITE_URL — that is the *backend's* own public URL (used by
// robots/sitemap), and basing the link on it sends customers to the backend.
// Priority: NEXT_PUBLIC_STOREFRONT_URL (dedicated override) → the allow-listed
// calling origin (the storefront that made this request) → canonical default.
const STOREFRONT_HOSTS = new Set([
  "www.doodly.in", "doodly.in", "doodly-admin.vercel.app",
  "localhost:4173", "127.0.0.1:4173",
]);
function storefrontBase(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const origin = req.headers.get("origin");
  if (origin) { try { if (STOREFRONT_HOSTS.has(new URL(origin).host)) return origin.replace(/\/$/, ""); } catch { /* ignore */ } }
  return "https://www.doodly.in";
}

export const POST = route("auth.forgot", async (req: NextRequest) => {
  const ctx = reqContext(req);
  const rl = rateLimit(`forgot:${ctx.ip ?? "anon"}`, 5, 60_000);
  if (!rl.ok) throw Errors.tooMany();

  const { email } = await parseBody(req, schema);

  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE" && !user.deletedAt) {
    const rawToken = generateToken();
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    // Always points at the storefront (.html — the static app has no clean URLs).
    const resetUrl = `${storefrontBase(req)}/reset-password.html?token=${rawToken}`;
    const sent = await sendPasswordResetEmail(user.email!, resetUrl, user.name);
    if (!sent.delivered) log.info("auth.forgot", "reset link (dev fallback)", { resetUrl });
    await audit({ userId: user.id, actorRole: "customer", action: "auth.forgot_password", target: user.id, ctx });
  }

  // Same response whether or not the account exists.
  return ok({ message: GENERIC });
});
