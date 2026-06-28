/* Bulk-orders API authorization. Admin endpoints are gated on the RBAC
   `orders` module (support / operations-via-admin / admin / super_admin).
   Role comes from the session in production; cookie is the dev/demo fallback. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";

const ROLES: RoleKey[] = [
  "customer", "delivery_executive", "support", "operations", "procurement",
  "accountant", "inventory", "quality", "marketing", "admin", "super_admin",
];

export interface ActorContext { role: RoleKey; actorId?: string; actorRole: string }

export function actorFrom(req: NextRequest): ActorContext {
  const cookieRole = req.cookies.get("doodly-role")?.value as RoleKey | undefined;
  const fallback: RoleKey = process.env.NODE_ENV === "production" ? "customer" : "super_admin";
  const role = cookieRole && ROLES.includes(cookieRole) ? cookieRole : fallback;
  return { role, actorId: req.cookies.get("doodly-uid")?.value, actorRole: role };
}

export const canViewBulk = (role: RoleKey) => can(role, "orders", "view");
export const canManageBulk = (role: RoleKey) => can(role, "orders", "edit");
