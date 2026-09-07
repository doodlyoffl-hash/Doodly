/* =============================================================
   Private Milk-Business module — authorization guard.

   This module is HIDDEN from normal navigation, but the static
   admin HTML/JS is publicly fetchable (storefront + backend are
   separate Vercel projects, so middleware.ts does NOT protect the
   static page). Therefore the REAL security boundary is THIS guard,
   invoked at the top of EVERY /api/private/milk-business/* route.

   Access = the `milkBusiness` RBAC module, granted to super_admin,
   accountant and operations (see lib/rbac.ts DEFAULT_MATRIX). The
   sensitive specials (adjust/close/reconcile) are granted at "full".
   ============================================================= */
import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

const MOD = "milkBusiness";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

/** Can open / read the private module at all. */
export const canUseMilkBusiness = (role: RoleKey) => can(role, MOD, "view");
/** Create sales / tankers / customers / payments etc. */
export const canWriteMilkBusiness = (role: RoleKey) => can(role, MOD, "create") || can(role, MOD, "edit");
/** Financial adjustments / reversals (special, "full" only). */
export const canAdjustMilkBusiness = (role: RoleKey) => can(role, MOD, "adjust");
/** Close / reopen a tanker (special, "full" only). */
export const canCloseTanker = (role: RoleKey) => can(role, MOD, "close");
/** Run/refresh a reconciliation (special, "full" only). */
export const canReconcile = (role: RoleKey) => can(role, MOD, "reconcile");
/** Export/print reports. */
export const canExportMilkBusiness = (role: RoleKey) => can(role, MOD, "export") || can(role, MOD, "view");

type Guard =
  | { ok: true; role: RoleKey; userId?: string }
  | { ok: false; res: NextResponse };

/** Standard gate for a private-module route. `action` defaults to "view".
   Usage:
     const g = requireMilkBusiness(req, "create");
     if (!g.ok) return g.res;
     // g.role, g.userId are the verified identity
*/
export function requireMilkBusiness(req: NextRequest, action = "view"): Guard {
  const role = actorRole(req);
  if (!can(role, MOD, action)) {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  // A verified real user id may be absent in dev (bridge actor). NEVER persist a
  // "static-*" / dev-bridge id into a User-FK column — callers pass userId through
  // to audit only, and null it out for FK writes.
  const uid = readUserId(req);
  return { ok: true, role, userId: uid && !/^static-/.test(uid) ? uid : undefined };
}
