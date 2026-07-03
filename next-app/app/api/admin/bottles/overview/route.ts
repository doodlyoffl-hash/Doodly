/* GET /api/admin/bottles/overview — bottle fleet dashboard: KPIs (fleet +
   customer ledger), per-capacity stage matrix, lifecycle graph.
   RBAC: bottleInventory:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { bottleFleetOverview } from "@/lib/bottles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.bottles.overview", async (req: NextRequest) => {
  requirePermission(req, "bottleInventory", "view");
  return ok(await bottleFleetOverview());
});
