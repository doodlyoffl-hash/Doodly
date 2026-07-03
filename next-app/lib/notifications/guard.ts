/* Notifications authorization — composing/sending campaigns is gated on the RBAC
   `notifications` module (marketing / admin / super — the Marketing role). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewNotifications = (role: RoleKey) => can(role, "notifications", "view");
export const canManageNotifications = (role: RoleKey) => can(role, "notifications", "edit");
