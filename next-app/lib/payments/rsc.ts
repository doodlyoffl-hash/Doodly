/* Server-Component guard for the Payments admin page. Matrix-driven: anyone
   with `payments:view` (Admin, Super-Admin, Accountant) may open the page;
   other staff are redirected. The API layer is the authoritative boundary. */
import "server-only";
import type { NextRequest } from "next/server";
import { headers, cookies } from "next/headers";
import { can, type RoleKey } from "@/lib/rbac";
import { isValidRoleKey } from "@/lib/auth/roles";

const DEV = process.env.NODE_ENV !== "production";

export function rscRole(): RoleKey {
  const fromHeader = headers().get("x-doodly-role");
  if (fromHeader && isValidRoleKey(fromHeader)) return fromHeader;
  if (DEV) {
    const cookieRole = cookies().get("doodly-role")?.value;
    if (cookieRole && isValidRoleKey(cookieRole)) return cookieRole;
    return "super_admin";
  }
  return "customer";
}

export const canViewPayments = (role: RoleKey) => can(role, "payments", "view");

export function reqIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}
