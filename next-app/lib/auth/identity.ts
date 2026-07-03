/* =============================================================
   DOODLY — Server-side identity for API route guards
   The authoritative identity comes from the Auth.js JWT session,
   which middleware verifies and forwards as the `x-doodly-uid` /
   `x-doodly-role` request headers (middleware strips any client-sent
   copies, so these headers are trustworthy inside route handlers).
   In development we additionally fall back to the legacy demo cookies
   so the dashboards stay explorable without signing in.
   ============================================================= */
import "server-only";
import type { NextRequest } from "next/server";
import type { RoleKey } from "@/lib/rbac";
import { isValidRoleKey } from "@/lib/auth/roles";

const DEV = process.env.NODE_ENV !== "production";

/** Verified user id (or null when unauthenticated). */
export function readUserId(req: NextRequest): string | null {
  const fromHeader = req.headers.get("x-doodly-uid");
  if (fromHeader) return fromHeader;
  if (DEV) return req.cookies.get("doodly-uid")?.value ?? null;
  return null;
}

/** Verified RBAC role. Production default is the least-privileged `customer`. */
export function readRole(req: NextRequest): RoleKey {
  const fromHeader = req.headers.get("x-doodly-role");
  if (fromHeader && isValidRoleKey(fromHeader)) return fromHeader;
  if (DEV) {
    const cookieRole = req.cookies.get("doodly-role")?.value;
    if (cookieRole && isValidRoleKey(cookieRole)) return cookieRole;
    return "super_admin"; // dev-only convenience for exploring admin surfaces
  }
  return "customer";
}
