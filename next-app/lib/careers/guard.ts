/* Careers authorization. Applying is public (unauthenticated storefront form).
   Viewing / managing applications is gated on the RBAC `careers` module
   (admin / super-admin — the HR / People area). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewCareers = (role: RoleKey) => can(role, "careers", "view") || can(role, "users", "view");
export const canManageCareers = (role: RoleKey) => can(role, "careers", "edit");
