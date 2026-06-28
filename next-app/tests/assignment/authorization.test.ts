import { describe, it, expect } from "vitest";
import { can, type RoleKey } from "@/lib/rbac";

/* The assignment API guard (lib/assignment/guard.ts) delegates to these RBAC
   decisions: view = can(role,"deliveries","view"); manage = assign || edit.
   These tests pin the authorization boundary without needing the HTTP server. */

const canView = (r: RoleKey) => can(r, "deliveries", "view");
const canManage = (r: RoleKey) => can(r, "deliveries", "assign") || can(r, "deliveries", "edit");

describe("assignment API authorization", () => {
  it("allows operations / admin / super_admin to manage assignments", () => {
    for (const r of ["operations", "admin", "super_admin"] as RoleKey[]) {
      expect(canView(r)).toBe(true);
      expect(canManage(r)).toBe(true);
    }
  });

  it("denies customers and delivery executives", () => {
    for (const r of ["customer", "delivery_executive"] as RoleKey[]) {
      expect(canView(r)).toBe(false);
      expect(canManage(r)).toBe(false);
    }
  });

  it("denies unrelated staff roles (accountant, marketing, support)", () => {
    for (const r of ["accountant", "marketing", "support"] as RoleKey[]) {
      expect(canManage(r)).toBe(false);
    }
  });
});
