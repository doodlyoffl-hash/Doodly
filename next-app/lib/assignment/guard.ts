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
import { readUserId, readRole } from "@/lib/auth/identity";

export interface ActorContext { role: RoleKey; actorId?: string; actorRole: string }

export function actorFrom(req: NextRequest): ActorContext {
  const role = readRole(req);
  return { role, actorId: readUserId(req) ?? undefined, actorRole: role };
}

export const canViewDeliveries = (role: RoleKey) => can(role, "deliveries", "view");
export const canManageDeliveries = (role: RoleKey) =>
  can(role, "deliveries", "assign") || can(role, "deliveries", "edit");
