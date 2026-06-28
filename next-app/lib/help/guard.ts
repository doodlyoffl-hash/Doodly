/* Help Center CMS authorization — editing the knowledge base is a content
   action gated on the RBAC `cms` module (marketing / admin / super-admin).
   The `doodly-role` cookie is the dev/demo stand-in. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";

const ROLES: RoleKey[] = [
  "customer", "delivery_executive", "support", "operations", "procurement",
  "accountant", "inventory", "quality", "marketing", "admin", "super_admin",
];

export function actorRole(req: NextRequest): RoleKey {
  const cookieRole = req.cookies.get("doodly-role")?.value as RoleKey | undefined;
  const fallback: RoleKey = process.env.NODE_ENV === "production" ? "customer" : "super_admin";
  return cookieRole && ROLES.includes(cookieRole) ? cookieRole : fallback;
}

export const canManageHelp = (role: RoleKey) => can(role, "cms", "edit");
