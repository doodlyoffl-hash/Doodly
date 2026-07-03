/* POST /api/dev/login — DEVELOPMENT-ONLY customer identity resolver.

   The standalone static app (:4173) has no Auth.js session cookie of its own
   (it talks to the backend cross-origin). To drive per-customer data it must
   learn the customer's REAL backend user id, which it then sends on every
   request via the X-Doodly-Actor-Id dev bridge (see middleware.ts). This route
   verifies credentials with the SAME bcrypt check Auth.js uses and returns the
   resolved identity — it is a convenience resolver, NOT a session issuer.

   Hard-disabled in production (returns 404): production uses the real Auth.js
   session, so middleware reads req.auth.user.id directly and never consults the
   dev bridge. CORS + preflight are handled by middleware for allowed origins. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { isValidRoleKey } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEV = process.env.NODE_ENV !== "production";

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

// Prisma Role enum (CUSTOMER / SUPER_ADMIN / …) → static-app RoleKey (customer / super_admin / …).
function roleKey(r: string): string {
  const k = String(r || "").toLowerCase();
  return isValidRoleKey(k) ? k : "customer";
}

export async function POST(req: NextRequest) {
  if (!DEV) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  if (!user || !passwordOk) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  return NextResponse.json(
    { ok: true, data: { id: user.id, name: user.name, email: user.email, role: roleKey(user.role) } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
