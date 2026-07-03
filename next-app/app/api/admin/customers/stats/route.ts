/* GET /api/admin/customers/stats — customer dashboard KPIs (customers:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { customerStats } from "@/lib/customers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.customers.stats", async (req: NextRequest) => {
  requirePermission(req, "customers", "view");
  return ok(await customerStats());
});
