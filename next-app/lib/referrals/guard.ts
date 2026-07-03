/* Referral admin authorization. Reuses existing RBAC modules (no new `referral`
   permission): viewing analytics is open to any manager who can view Reports or
   Customers (marketing / support / finance / ops …); issuing/reversing rewards is
   a FINANCIAL action gated like the Wallet module (accountant / admin / super). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewReferrals = (role: RoleKey) =>
  can(role, "reports", "view") || can(role, "customers", "view") || can(role, "payments", "edit") || can(role, "billing", "edit");

/** Reward issuance / reversal / rejection + settings = financial → accountant / admin / super. */
export const canManageReferrals = (role: RoleKey) =>
  can(role, "payments", "refund") || can(role, "payments", "edit") || can(role, "billing", "edit");
