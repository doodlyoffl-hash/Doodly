/* =============================================================
   DOODLY — Route authorization helpers
   Thin wrappers over the verified identity (middleware-injected
   headers) + the RBAC matrix. Throw ApiError so the route() wrapper
   maps them to clean 401/403 JSON.
   ============================================================= */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readRole, readUserId } from "@/lib/auth/identity";
import { Errors } from "@/lib/http";

/** The signed-in user id, or 401. */
export function requireUserId(req: NextRequest): string {
  const uid = readUserId(req);
  if (!uid) throw Errors.unauthorized();
  return uid;
}

/** Require an RBAC permission; returns the (verified) role for further checks. */
export function requirePermission(req: NextRequest, module: string, action = "view"): RoleKey {
  const role = readRole(req);
  if (!can(role, module, action)) throw Errors.forbidden();
  return role;
}
