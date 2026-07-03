/* GET /api/admin/products/stats — dashboard KPIs (products:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { productStats } from "@/lib/products/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.products.stats", async (req: NextRequest) => {
  requirePermission(req, "products", "view");
  return ok(await productStats());
});
