/* GET /api/admin/drivers/stats — Drivers dashboard KPIs + fleet performance,
   derived live from Driver / ExecutiveStatus / Delivery. RBAC: drivers:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { driverStats } from "@/lib/drivers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.drivers.stats", async (req: NextRequest) => {
  requirePermission(req, "drivers", "view");
  return ok(await driverStats());
});
