/* GET /api/admin/farmers/stats — Farmers dashboard KPIs from live Farmer +
   Procurement + QualityTest. RBAC: farmers:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { farmerStats } from "@/lib/farmers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.farmers.stats", async (req: NextRequest) => {
  requirePermission(req, "farmers", "view");
  return ok(await farmerStats());
});
