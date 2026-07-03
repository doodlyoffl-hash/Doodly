/* GET /api/admin/products/reports — stock / performance / availability + CSV rows (products:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { productReports } from "@/lib/products/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.products.reports", async (req: NextRequest) => {
  requirePermission(req, "products", "view");
  return ok(await productReports());
});
