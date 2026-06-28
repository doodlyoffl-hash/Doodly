/* =============================================================
   Auto Delivery Assignment — API authorization helper.
   Derives the actor's role from the request and gates on the RBAC
   `deliveries` module. In production the role MUST come from the
   authenticated session/JWT; the cookie is the dev/demo fallback
   (see lib/rbac.ts impersonation notes).
   ============================================================= */
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

export const canViewDeliveries = (role: RoleKey) => can(role, "deliveries", "view");
export const canManageDeliveries = (role: RoleKey) =>
  can(role, "deliveries", "assign") || can(role, "deliveries", "edit");
