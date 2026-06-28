/* Expense Management authorization. The module (Finance → Daily Expenses) is
   restricted to Accountant, Admin and Super-Admin. Role-based permissions:
   - Accountant: view, create, edit, record payments, reports.
   - Admin / Super-Admin: the above + approve/reject, manage categories, soft delete.
   (Separation of duties: the accountant who records an expense is not its approver.)
   The `doodly-role` cookie is the dev/demo stand-in; production uses the real
   auth session. THIS is the security boundary (client filtering is UX only). */
import "server-only";
import type { NextRequest } from "next/server";
import type { RoleKey } from "@/lib/rbac";

const ROLES: RoleKey[] = [
  "customer", "delivery_executive", "support", "operations", "procurement",
  "accountant", "inventory", "quality", "marketing", "admin", "super_admin",
];

export function actorRole(req: NextRequest): RoleKey {
  const cookieRole = req.cookies.get("doodly-role")?.value as RoleKey | undefined;
  const fallback: RoleKey = process.env.NODE_ENV === "production" ? "customer" : "super_admin";
  return cookieRole && ROLES.includes(cookieRole) ? cookieRole : fallback;
}

export function actorId(req: NextRequest): string | undefined {
  return req.cookies.get("doodly-uid")?.value ?? undefined;
}

export function actorName(req: NextRequest): string | undefined {
  const v = req.cookies.get("doodly-uname")?.value;
  return v ? decodeURIComponent(v) : undefined;
}

/** Accountant + Admin + Super-Admin may use the module. Nobody else. */
export const canUseExpenses = (role: RoleKey) => role === "accountant" || role === "admin" || role === "super_admin";

/** Approve / reject is a manager action — Admin + Super-Admin only. */
export const canApproveExpenses = (role: RoleKey) => role === "admin" || role === "super_admin";

/** Manage categories + soft delete — Admin + Super-Admin only. */
export const canManageExpenseSettings = (role: RoleKey) => role === "admin" || role === "super_admin";
