/* Wallet API authorization. Customer endpoints derive the user id from the
   session (the `doodly-uid` cookie is the dev/demo stand-in — production uses
   the real auth session). Admin endpoints gate on the RBAC `payments`/`billing`
   modules (accountant / admin / super_admin). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";

const ROLES: RoleKey[] = [
  "customer", "delivery_executive", "support", "operations", "procurement",
  "accountant", "inventory", "quality", "marketing", "admin", "super_admin",
];

export function currentUserId(req: NextRequest): string | null {
  return req.cookies.get("doodly-uid")?.value ?? null;
}

export function actorRole(req: NextRequest): RoleKey {
  const cookieRole = req.cookies.get("doodly-role")?.value as RoleKey | undefined;
  const fallback: RoleKey = process.env.NODE_ENV === "production" ? "customer" : "super_admin";
  return cookieRole && ROLES.includes(cookieRole) ? cookieRole : fallback;
}

export const canViewWallets = (role: RoleKey) => can(role, "payments", "view") || can(role, "billing", "view");
export const canManageWallets = (role: RoleKey) =>
  can(role, "payments", "refund") || can(role, "payments", "edit") || can(role, "billing", "edit");
