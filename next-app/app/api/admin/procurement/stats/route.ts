/* GET /api/admin/procurement/stats — Procurement dashboard KPIs from live
   Procurement + Farmer + QualityTest. RBAC: procurement:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { procurementStats } from "@/lib/procurement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.procurement.stats", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  return ok(await procurementStats());
});
