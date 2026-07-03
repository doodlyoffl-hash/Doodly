/* Coupon authorization. Managing coupons (create/edit/lifecycle/bulk) is gated on
   the RBAC `coupons` module (marketing / admin / super). Viewing analytics + records
   is open to anyone who can view coupons, reports or customers (adds finance +
   customer-support). Applying a coupon at checkout is public (customer session). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewCoupons = (role: RoleKey) => can(role, "coupons", "view") || can(role, "reports", "view") || can(role, "customers", "view");
export const canManageCoupons = (role: RoleKey) => can(role, "coupons", "edit");
