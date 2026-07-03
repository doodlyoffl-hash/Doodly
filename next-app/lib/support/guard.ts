/* Support Tickets authorization. Viewing the desk is open to Support/Admin/Super
   (and anyone who can view customers); managing tickets (assign/status/reply/close)
   is gated on the RBAC `support` module. */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewSupport = (role: RoleKey) => can(role, "support", "view") || can(role, "customers", "view");
export const canManageSupport = (role: RoleKey) => can(role, "support", "edit");
