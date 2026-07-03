/* Subscriptions (admin) authorization. The management module is restricted to
   Admin and Super-Admin ONLY — never customers, delivery executives, or other
   staff roles (even support, which has matrix-level subscriptions:view used in
   other surfaces). THIS is the security boundary; client filtering is UX only. */
import "server-only";
import type { NextRequest } from "next/server";
import type { RoleKey } from "@/lib/rbac";
import { readRole, readUserId } from "@/lib/auth/identity";
import { Errors } from "@/lib/http";

export function actorRole(req: NextRequest): RoleKey {
  return readRole(req);
}
export function actorId(req: NextRequest): string | undefined {
  return readUserId(req) ?? undefined;
}

/** Admin + Super-Admin may manage subscriptions. Nobody else. */
export const canManageSubs = (role: RoleKey) => role === "admin" || role === "super_admin";

/** Throw 403 unless the caller is Admin or Super-Admin; returns the role. */
export function requireSubsAdmin(req: NextRequest): RoleKey {
  const role = actorRole(req);
  if (!canManageSubs(role)) throw Errors.forbidden();
  return role;
}
