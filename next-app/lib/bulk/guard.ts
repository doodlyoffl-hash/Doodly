/* Bulk-orders API authorization. Admin endpoints are gated on the RBAC
   `orders` module (support / operations-via-admin / admin / super_admin).
   Role comes from the session in production; cookie is the dev/demo fallback. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export interface ActorContext { role: RoleKey; actorId?: string; actorRole: string }

export function actorFrom(req: NextRequest): ActorContext {
  const role = readRole(req);
  return { role, actorId: readUserId(req) ?? undefined, actorRole: role };
}

export const canViewBulk = (role: RoleKey) => can(role, "orders", "view");
export const canManageBulk = (role: RoleKey) => can(role, "orders", "edit");
