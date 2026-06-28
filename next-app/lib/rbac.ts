/* =============================================================
   DOODLY — RBAC (server-side authoritative copy)
   Mirrors the static DOODLY_RBAC matrix. Enforce this in
   middleware.ts (route protection) AND in every API route /
   server action (API authorization) — the client filter is UX
   only; THIS is the security boundary. The matrix can be loaded
   from the DB (RoleDef / RolePermission) so new roles need no
   deploy; the defaults below are the fallback seed.
   ============================================================= */
export type RoleKey =
  | "customer" | "delivery_executive" | "support" | "operations" | "procurement"
  | "accountant" | "inventory" | "quality" | "marketing" | "admin" | "super_admin";

type Level = "" | "view" | "manage" | "full";
const LEVEL_ACTIONS: Record<string, string[]> = {
  view: ["view"], manage: ["view", "create", "edit", "export"], full: ["view", "create", "edit", "export", "delete"],
};
// specials granted at "full"
const SPECIALS: Record<string, string[]> = { payments: ["refund", "approve"], billing: ["approve"], inventory: ["adjust"], bottleInventory: ["adjust"], deliveries: ["assign"] };

const ADMIN_FULL: Record<string, Level> = {};
["dashboard", "orders", "subscriptions", "billing", "customers", "payments", "revenue", "coupons", "offers", "products", "categories", "inventory", "bottleInventory", "deliverySettings", "deliveries", "serviceableAreas", "drivers", "routes", "farmers", "procurement", "quality", "reports", "blogs", "cms", "notifications", "support", "users", "roles", "auditLogs", "settings"].forEach((m) => (ADMIN_FULL[m] = "full"));
Object.assign(ADMIN_FULL, { permissions: "", settings: "view", roles: "view", auditLogs: "view" });

export const DEFAULT_MATRIX: Record<RoleKey, "*" | Record<string, Level>> = {
  super_admin: "*",
  admin: ADMIN_FULL,
  support: { dashboard: "view", customers: "view", orders: "manage", subscriptions: "view", support: "full" },
  operations: { dashboard: "view", deliveries: "full", drivers: "manage", routes: "manage", serviceableAreas: "manage", deliverySettings: "manage", inventory: "view", reports: "view" },
  procurement: { dashboard: "view", farmers: "manage", procurement: "full", quality: "view", reports: "view" },
  accountant: { dashboard: "view", revenue: "view", payments: "full", billing: "manage", reports: "manage", coupons: "view" },
  inventory: { dashboard: "view", inventory: "full", bottleInventory: "full", reports: "view" },
  quality: { dashboard: "view", quality: "full", procurement: "view", reports: "view" },
  marketing: { dashboard: "view", coupons: "full", offers: "full", blogs: "full", cms: "manage", notifications: "manage", reports: "view" },
  customer: {}, delivery_executive: {},
};

export function can(role: RoleKey, module: string, action = "view", matrix = DEFAULT_MATRIX): boolean {
  const m = matrix[role];
  if (m === "*") return true;
  const lvl = (m?.[module] ?? "") as Level;
  if (!lvl) return false;
  if (LEVEL_ACTIONS[lvl]?.includes(action)) return true;
  return lvl === "full" && (SPECIALS[module] ?? []).includes(action);
}

/** Map an /admin/<slug> path to its module key. */
export function routeModule(path: string): string | null {
  const m = path.match(/\/admin\/([a-z-]+)/i);
  return m ? m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : null;
}

/** Route protection — use in middleware.ts: deny before the page even renders. */
export function canAccessPath(role: RoleKey, path: string, matrix = DEFAULT_MATRIX): boolean {
  // surface gate: customers/executives never reach /admin
  if (path.startsWith("/admin") && (role === "customer" || role === "delivery_executive")) return false;
  const mod = routeModule(path);
  return mod ? can(role, mod, "view", matrix) : true;
}

/* Usage:
   // middleware.ts
   import { canAccessPath } from "@/lib/rbac";
   const role = sessionRole(req);                 // from your JWT/session
   if (!canAccessPath(role, req.nextUrl.pathname)) return NextResponse.redirect(homeFor(role));

   // an API route
   if (!can(role, "payments", "refund")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

   Super-Admin "view as" impersonation: keep the REAL role in the JWT and the
   ACTIVE role in a separate signed cookie; gate on ACTIVE, but log AuditLog.actorRole
   with both, and only allow setting the active cookie when realRole === SUPER_ADMIN.
*/
