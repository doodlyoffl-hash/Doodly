/* Subscription Billing authorization. The billing/finance module is restricted
   to Admin and Super-Admin ONLY (per the module spec). Config changes (GST rate,
   auto-pay retry policy) are Super-Admin only. THIS is the security boundary;
   client filtering is UX only. */
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

export const canManageBilling = (role: RoleKey) => role === "admin" || role === "super_admin";
export const isSuperAdmin = (role: RoleKey) => role === "super_admin";

/** Throw 403 unless the caller is Admin or Super-Admin; returns the role. */
export function requireBillingAdmin(req: NextRequest): RoleKey {
  const role = actorRole(req);
  if (!canManageBilling(role)) throw Errors.forbidden();
  return role;
}

/** Throw 403 unless Super-Admin (billing config). */
export function requireBillingSuperAdmin(req: NextRequest): RoleKey {
  const role = actorRole(req);
  if (!isSuperAdmin(role)) throw Errors.forbidden();
  return role;
}
