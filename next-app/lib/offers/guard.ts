/* Offer authorization. Managing offers/campaigns (create/edit/lifecycle/bulk) is
   gated on the RBAC `offers` module (marketing / admin / super). Viewing analytics
   is open to anyone who can view offers, reports or customers (adds finance +
   customer-support). Applying an offer at checkout is public (customer session). */
import "server-only";
import type { NextRequest } from "next/server";
import { can, type RoleKey } from "@/lib/rbac";
import { readUserId, readRole } from "@/lib/auth/identity";

export function actorRole(req: NextRequest): RoleKey { return readRole(req); }
export function actorId(req: NextRequest): string | undefined { return readUserId(req) ?? undefined; }

export const canViewOffers = (role: RoleKey) => can(role, "offers", "view") || can(role, "reports", "view") || can(role, "customers", "view");
export const canManageOffers = (role: RoleKey) => can(role, "offers", "edit");
