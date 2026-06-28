/* Global search authorization. Scope is derived from the session: admins get
   the admin scope (records + admin nav), signed-in customers get their orders +
   customer features, everyone gets the public index. Trending/analytics
   management is gated on the RBAC `cms` module. Cookies are the dev/demo
   stand-in for the real auth session. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import type { SearchScope } from "./engine";

const ROLES: RoleKey[] = [
  "customer", "delivery_executive", "support", "operations", "procurement",
  "accountant", "inventory", "quality", "marketing", "admin", "super_admin",
];

export function actorRole(req: NextRequest): RoleKey {
  const cookieRole = req.cookies.get("doodly-role")?.value as RoleKey | undefined;
  const fallback: RoleKey = process.env.NODE_ENV === "production" ? "customer" : "super_admin";
  return cookieRole && ROLES.includes(cookieRole) ? cookieRole : fallback;
}

export function currentUserId(req: NextRequest): string | null {
  return req.cookies.get("doodly-uid")?.value ?? null;
}

export function searchScope(req: NextRequest): SearchScope {
  const role = actorRole(req);
  if (role === "admin" || role === "super_admin") return "admin";
  if (currentUserId(req)) return "customer";
  return "public";
}

export const canManageSearch = (role: RoleKey) => can(role, "cms", "edit");
