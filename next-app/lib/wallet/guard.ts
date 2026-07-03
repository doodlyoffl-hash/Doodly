/* Wallet API authorization. Customer endpoints derive the user id from the
   session (the `doodly-uid` cookie is the dev/demo stand-in — production uses
   the real auth session). Admin endpoints gate on the RBAC `payments`/`billing`
   modules (accountant / admin / super_admin). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function currentUserId(req: NextRequest): string | null {
  return readUserId(req);
}

export function actorRole(req: NextRequest): RoleKey {
  return readRole(req);
}

/** The acting admin's id (for WalletTxn.createdById — a plain label column, not a User FK). */
export function actorId(req: NextRequest): string | null {
  return readUserId(req);
}

export const canViewWallets = (role: RoleKey) => can(role, "payments", "view") || can(role, "billing", "view");
export const canManageWallets = (role: RoleKey) =>
  can(role, "payments", "refund") || can(role, "payments", "edit") || can(role, "billing", "edit");
