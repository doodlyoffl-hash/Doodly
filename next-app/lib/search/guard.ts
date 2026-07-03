/* Global search authorization. Scope is derived from the session: admins get
   the admin scope (records + admin nav), signed-in customers get their orders +
   customer features, everyone gets the public index. Trending/analytics
   management is gated on the RBAC `cms` module. Cookies are the dev/demo
   stand-in for the real auth session. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import type { SearchScope } from "./engine";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey {
  return readRole(req);
}

export function currentUserId(req: NextRequest): string | null {
  return readUserId(req);
}

export function searchScope(req: NextRequest): SearchScope {
  const role = actorRole(req);
  if (role === "admin" || role === "super_admin") return "admin";
  if (currentUserId(req)) return "customer";
  return "public";
}

/** Managing trending / editing search settings — CMS editors (admin / super / marketing). */
export const canManageSearch = (role: RoleKey) => can(role, "cms", "edit");

/** Viewing Search Insights analytics — any manager who can view Reports or CMS
 *  (super / admin / marketing / operations / procurement / accountant / inventory / quality). */
export const canViewSearch = (role: RoleKey) => can(role, "reports", "view") || can(role, "cms", "view") || canManageSearch(role);
