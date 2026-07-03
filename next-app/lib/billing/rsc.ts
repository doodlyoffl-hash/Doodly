/* Server-Component role reader for the Subscription Billing page guard.
   Mirrors lib/auth/identity.readRole but sources the verified role from the
   middleware-injected `x-doodly-role` header (and the dev demo cookie). */
import "server-only";
import { headers, cookies } from "next/headers";
import type { RoleKey } from "@/lib/rbac";
import { isValidRoleKey } from "@/lib/auth/roles";

const DEV = process.env.NODE_ENV !== "production";

export function rscRole(): RoleKey {
  const fromHeader = headers().get("x-doodly-role");
  if (fromHeader && isValidRoleKey(fromHeader)) return fromHeader;
  if (DEV) {
    const cookieRole = cookies().get("doodly-role")?.value;
    if (cookieRole && isValidRoleKey(cookieRole)) return cookieRole;
    return "super_admin";
  }
  return "customer";
}

export const isBillingAdminRole = (role: RoleKey) => role === "admin" || role === "super_admin";
