/* B2B Order Management authorization. The module is restricted to Admin and
   Super-Admin ONLY — never customers, delivery executives, or other staff roles.
   Destructive/configuration actions (soft delete, config) are Super-Admin only.
   The `doodly-role` cookie is the dev/demo stand-in; production uses the real
   auth session. THIS is the security boundary (client filtering is UX only). */
import "server-only";
import type { NextRequest } from "next/server";
import type { RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey {
  return readRole(req);
}

export function actorId(req: NextRequest): string | undefined {
  return readUserId(req) ?? undefined;
}

/** Admin + Super-Admin may use the B2B module. Nobody else. */
export const canUseB2B = (role: RoleKey) => role === "admin" || role === "super_admin";

/** Super-Admin only: soft delete, ID-format / pricing / credit-limit config. */
export const isSuperAdmin = (role: RoleKey) => role === "super_admin";
