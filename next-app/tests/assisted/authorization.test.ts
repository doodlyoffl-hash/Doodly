import { describe, it, expect } from "vitest";
import { can, type RoleKey } from "@/lib/rbac";

/* The assisted-order API guards delegate to these RBAC decisions:
   POST /api/admin/orders         → can(role,"assistedOrders","create")
   POST /api/admin/orders/preview → can(role,"assistedOrders","create")
   GET  /api/admin/orders/dup...  → can(role,"assistedOrders","view")
   This pins the authorization boundary (Part 4) without the HTTP server. */

const canCreate = (r: RoleKey) => can(r, "assistedOrders", "create");
const canView = (r: RoleKey) => can(r, "assistedOrders", "view");

describe("assisted-order API authorization", () => {
  it("allows super_admin, admin, support, operations to place assisted orders", () => {
    for (const r of ["super_admin", "admin", "support", "operations"] as RoleKey[]) {
      expect(canCreate(r)).toBe(true);
      expect(canView(r)).toBe(true);
    }
  });

  it("denies delivery executives and customers (Part 4: not without explicit permission)", () => {
    for (const r of ["delivery_executive", "customer"] as RoleKey[]) {
      expect(canCreate(r)).toBe(false);
    }
  });

  it("denies unrelated staff roles", () => {
    for (const r of ["accountant", "marketing", "inventory", "quality", "procurement"] as RoleKey[]) {
      expect(canCreate(r)).toBe(false);
    }
  });
});
