/* GET /api/admin/deliveries/stats — Delivery Management dashboard KPIs +
   per-executive performance, derived live from Delivery records.
   RBAC: deliveries:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { deliveryStats } from "@/lib/delivery/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.deliveries.stats", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  return ok(await deliveryStats());
});
