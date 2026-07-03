/* GET /api/admin/customers/options — active delivery executives (for assign). customers:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { deliveryExecutives } from "@/lib/customers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.customers.options", async (req: NextRequest) => {
  requirePermission(req, "customers", "view");
  return ok(await deliveryExecutives());
});
