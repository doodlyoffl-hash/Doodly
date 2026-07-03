/* GET /api/admin/routes/stats — Routes dashboard KPIs from live Route + Delivery.
   RBAC: routes:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { routeStats } from "@/lib/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.routes.stats", async (req: NextRequest) => {
  requirePermission(req, "routes", "view");
  return ok(await routeStats());
});
