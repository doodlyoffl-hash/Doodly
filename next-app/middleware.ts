/* =============================================================
   DOODLY — Route gating + identity forwarding (the trust boundary)
   1) Verifies the Auth.js JWT session (edge-safe config).
   2) Gates dashboard surfaces BY URL so changing the address bar
      can't expose a surface to the wrong audience:
        /account -> any authenticated user
        /driver  -> delivery executive (or super-admin impersonation)
        /admin   -> any staff role (NOT customer / delivery executive)
   3) Forwards the VERIFIED identity to API routes + server components
      as x-doodly-uid / x-doodly-role headers, after stripping any
      client-sent copies — so per-module API guards can authorize
      synchronously and can't be spoofed.
   In development, if there's no session we fall back to the legacy
   doodly-uid / doodly-role demo cookies so the dashboards stay
   explorable without signing in. Fine-grained, per-module access is
   ALSO enforced inside every API route (the data layer).
   ============================================================= */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { authConfig } from "./auth.config";
import { isStaff, homeFor, isValidRoleKey } from "@/lib/auth/roles";
import type { RoleKey } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);
const DEV = process.env.NODE_ENV !== "production";

// Origins of the standalone static app (:4173) allowed to call the API cross-origin.
// Override in production via STATIC_ORIGINS (comma-separated).
const STATIC_ORIGINS = (process.env.STATIC_ORIGINS || "http://localhost:4173,http://127.0.0.1:4173")
  .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);   // tolerate trailing slashes in config
function allowedOrigin(req: { headers: { get(n: string): string | null } }): string | null {
  const o = req.headers.get("origin");
  return o && STATIC_ORIGINS.indexOf(o) >= 0 ? o : null;
}
function withCors(res: NextResponse, origin: string | null): NextResponse {
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Doodly-Actor, X-Doodly-Actor-Id");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export default auth(async (req) => {
  const path = req.nextUrl.pathname;
  const origin = allowedOrigin(req);

  // CORS preflight from the static app — answer before any auth work.
  if (req.method === "OPTIONS" && origin) return withCors(new NextResponse(null, { status: 204 }), origin);

  // ---- resolve verified identity (session first, bearer token, dev bridges) ----
  let uid: string | null = req.auth?.user?.id ?? null;
  let role: RoleKey | null = (req.auth?.user?.role as RoleKey) ?? null;
  let tokenVer: string | null = null;   // the bearer token's version claim (for instant revocation)
  // Production-safe bearer token issued by /api/auth/token (the standalone
  // storefront's sign-in — the Auth.js cookie can't cross domains).
  if (!uid) {
    const authz = req.headers.get("authorization");
    const secret = process.env.AUTH_SECRET;
    if (authz && authz.startsWith("Bearer ") && secret) {
      try {
        const { payload } = await jwtVerify(authz.slice(7), new TextEncoder().encode(secret), { issuer: "doodly", audience: "doodly-static" });
        if (typeof payload.sub === "string" && payload.sub) {
          uid = payload.sub;
          if (typeof payload.role === "string" && isValidRoleKey(payload.role)) role = payload.role;
          if (typeof payload.tv === "number") tokenVer = String(payload.tv);   // carried downstream for the revocation check
        }
      } catch { /* invalid or expired token → treated as unauthenticated */ }
    }
  }
  if (!uid && DEV) {
    // (a) cross-origin static app: trust X-Doodly-Actor headers ONLY in dev + from an allowed origin.
    if (origin) {
      const ha = req.headers.get("x-doodly-actor");
      const hi = req.headers.get("x-doodly-actor-id");
      if (ha && isValidRoleKey(ha)) role = ha;
      if (hi) uid = hi;
    }
    // (b) legacy same-origin demo cookies.
    if (!uid) uid = req.cookies.get("doodly-uid")?.value ?? null;
    if (!role) { const c = req.cookies.get("doodly-role")?.value; if (c && isValidRoleKey(c)) role = c; }
  }
  const signedIn = Boolean(uid);

  // ---- forward verified identity downstream (strip client-sent copies) ----
  const headers = new Headers(req.headers);
  headers.delete("x-doodly-uid");
  headers.delete("x-doodly-role");
  headers.delete("x-doodly-tv");                       // never trust a client-sent version
  if (uid) headers.set("x-doodly-uid", uid);
  if (role) headers.set("x-doodly-role", role);
  if (tokenVer !== null) headers.set("x-doodly-tv", tokenVer);
  const pass = () => withCors(NextResponse.next({ request: { headers } }), origin);

  const denyTo = (pathname: string) => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    url.search = `?from=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  };

  // ---- surface gating ----
  if (path.startsWith("/admin")) {
    if (!signedIn) return denyTo("/login");
    if (!role || !isStaff(role)) return denyTo(role ? homeFor(role) : "/login");
  } else if (path.startsWith("/driver")) {
    if (!signedIn) return denyTo("/login");
    if (role !== "delivery_executive" && role !== "super_admin") return denyTo(role ? homeFor(role) : "/login");
  } else if (path.startsWith("/account")) {
    if (!signedIn) return denyTo("/login");
  }

  return pass();
});

export const config = {
  // Run on the gated surfaces AND on all API routes except Auth.js's own
  // (so verified identity headers are injected for every data endpoint).
  matcher: [
    "/account/:path*",
    "/driver/:path*",
    "/admin/:path*",
    "/api/((?!auth/).*)",
  ],
};
