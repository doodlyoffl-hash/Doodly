/* POST /api/token — production-safe sign-in for the standalone storefront.
   (Deliberately NOT under /api/auth/* — the middleware matcher excludes that
   namespace for Auth.js's own routes, and this endpoint needs the middleware
   to attach CORS headers for the cross-origin static app.)

   The static site runs on its own domain, so the Auth.js session cookie
   (set on this backend's domain) never reaches it. Instead the storefront
   exchanges email+password here for a signed bearer token (HS256 with the
   same AUTH_SECRET Auth.js uses) and sends it as `Authorization: Bearer …`
   on every API call; middleware.ts verifies the signature and forwards the
   identity exactly like a session. Same credential rules as auth.ts:
   bcrypt check, ACTIVE status, not soft-deleted. Rate-limited + audited. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { isValidRoleKey } from "@/lib/auth/roles";
import { rateLimit } from "@/lib/auth/ratelimit";
import { audit, recordLogin } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_DAYS = 30;

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function roleKey(r: string): string {
  const k = String(r || "").toLowerCase();
  return isValidRoleKey(k) ? k : "customer";
}

export async function POST(req: NextRequest) {
  const ctx = reqContext(req);
  const rl = rateLimit(`token:${ctx.ip ?? "unknown"}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts — please try again in a minute." }, { status: 429 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 422 });

  const email = parsed.data.email.toLowerCase();
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, status: true, passwordHash: true, deletedAt: true },
  });
  const eligible = !!(user && user.passwordHash && user.status === "ACTIVE" && !user.deletedAt);
  const passwordOk = eligible ? await verifyPassword(parsed.data.password, user!.passwordHash!) : false;
  if (!user || !passwordOk) {
    await recordLogin({ userId: user?.id ?? null, success: false, ctx });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Auth is not configured on the server." }, { status: 500 });

  const role = roleKey(user.role);
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_DAYS}d`)
    .setIssuer("doodly")
    .setAudience("doodly-static")
    .sign(new TextEncoder().encode(secret));

  await recordLogin({ userId: user.id, success: true, ctx });
  await audit({ userId: user.id, actorRole: role, action: "auth.token_login", ctx });

  return NextResponse.json(
    { ok: true, data: { token, expiresInDays: TOKEN_TTL_DAYS, user: { id: user.id, name: user.name, email: user.email, role } } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
