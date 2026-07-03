/* =============================================================
   DOODLY — Role mapping & post-login routing
   Bridges the Prisma `Role` enum (DB) and the RBAC `RoleKey`
   (lib/rbac.ts). They are intentionally 1:1 (just casing) so the
   authoritative matrix in lib/rbac.ts works directly off the
   session role.
   ============================================================= */
import type { Role } from "@prisma/client";
import type { RoleKey } from "@/lib/rbac";

const ROLE_KEYS: RoleKey[] = [
  "customer", "delivery_executive", "support", "operations", "procurement",
  "accountant", "inventory", "quality", "marketing", "admin", "super_admin",
];

/** Prisma enum (SUPER_ADMIN) -> RBAC key (super_admin). */
export function roleKeyFromEnum(role: Role | string): RoleKey {
  const key = String(role).toLowerCase() as RoleKey;
  return ROLE_KEYS.includes(key) ? key : "customer";
}

/** RBAC key (super_admin) -> Prisma enum (SUPER_ADMIN). */
export function roleEnumFromKey(key: RoleKey | string): Role {
  return String(key).toUpperCase() as Role;
}

export function isValidRoleKey(key: string): key is RoleKey {
  return ROLE_KEYS.includes(key as RoleKey);
}

const STAFF: ReadonlySet<RoleKey> = new Set<RoleKey>([
  "support", "operations", "procurement", "accountant",
  "inventory", "quality", "marketing", "admin", "super_admin",
]);

export const isStaff = (role: RoleKey) => STAFF.has(role);

/** Where a user lands after signing in (and the redirect target when denied a surface). */
export function homeFor(role: RoleKey): string {
  if (role === "delivery_executive") return "/driver/dashboard";
  if (isStaff(role)) return "/admin/dashboard";
  return "/account/dashboard";
}
