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
import { isValidRoleKey, isStaff } from "@/lib/auth/roles";
import type { RoleKey } from "@/lib/rbac";
import { rateLimit } from "@/lib/auth/ratelimit";
import { audit, recordLogin } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Role-scoped session lifetime: staff/admin tokens are the crown jewels, so
// they expire fast; delivery executives log in most days; customers get a
// long, convenient session. A leaked privileged token self-destructs quickly.
function ttlDaysFor(role: string): number {
  if (isStaff(role as RoleKey)) return 3;
  if (role === "delivery_executive") return 7;
  return 30;
}

// Cross-instance brute-force guard: the in-memory limiter resets per serverless
// instance, so an attacker spread across instances gets more tries. This counts
// real failed attempts from the DB (shared) in a rolling window.
const DB_FAIL_WINDOW_MS = 15 * 60_000;
const DB_FAIL_LIMIT = 10;

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

  // persistent, cross-instance guard (fail-open if the count errors)
  if (ctx.ip) {
    try {
      const recentFails = await db.loginHistory.count({
        where: { ip: ctx.ip, success: false, createdAt: { gte: new Date(Date.now() - DB_FAIL_WINDOW_MS) } },
      });
      if (recentFails >= DB_FAIL_LIMIT) {
        return NextResponse.json({ error: "Too many failed attempts — please try again later." }, { status: 429 });
      }
    } catch { /* fail-open: never lock everyone out on a DB hiccup */ }
  }

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
  const ttlDays = ttlDaysFor(role);
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .setIssuer("doodly")
    .setAudience("doodly-static")
    .sign(new TextEncoder().encode(secret));

  await recordLogin({ userId: user.id, success: true, ctx });
  await audit({ userId: user.id, actorRole: role, action: "auth.token_login", ctx });

  return NextResponse.json(
    { ok: true, data: { token, expiresInDays: ttlDays, user: { id: user.id, name: user.name, email: user.email, role } } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
