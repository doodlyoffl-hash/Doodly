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

/* The builder also calls customer-directory endpoints, which now accept the customers
   permission OR assistedOrders:create (least-privilege). This pins that boundary:
   assisted agents get search/profile/create-customer/add-address — and nothing more. */
describe("assisted-order builder customer access (least-privilege OR)", () => {
  const canSearchOrProfile = (r: RoleKey) => can(r, "customers", "view") || can(r, "assistedOrders", "create");
  const canCreateCustomer = (r: RoleKey) => can(r, "customers", "create") || can(r, "assistedOrders", "create");
  const canAddAddress = (r: RoleKey) => can(r, "customers", "edit") || can(r, "assistedOrders", "create");   // the add-address action only

  it("lets support + operations run every builder customer op", () => {
    for (const r of ["support", "operations", "admin", "super_admin"] as RoleKey[]) {
      expect(canSearchOrProfile(r)).toBe(true);
      expect(canCreateCustomer(r)).toBe(true);
      expect(canAddAddress(r)).toBe(true);
    }
  });

  it("operations reaches the directory ONLY via assistedOrders (it has no customers rights)", () => {
    expect(can("operations", "customers", "view")).toBe(false);
    expect(canSearchOrProfile("operations")).toBe(true);   // enabled purely by assistedOrders:create
  });

  it("assisted agents CANNOT do sensitive CRM actions (wallet/reset/delete need customers:edit)", () => {
    // support/operations lack customers:edit, so only the add-address action is open to them —
    // wallet-adjust, reset-password, status changes and delete-address stay locked.
    for (const r of ["support", "operations"] as RoleKey[]) {
      expect(can(r, "customers", "edit")).toBe(false);
      expect(can(r, "customers", "delete")).toBe(false);
    }
  });

  it("still denies roles with neither permission", () => {
    for (const r of ["marketing", "delivery_executive", "quality"] as RoleKey[]) {
      expect(canSearchOrProfile(r)).toBe(false);
    }
  });
});
