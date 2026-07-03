/* GET /api/admin/inventory/overview — unified product-variant + supplies stock
   with dashboard stats (inventory:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { inventoryOverview } from "@/lib/inventory/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.inventory.overview", async (req: NextRequest) => {
  requirePermission(req, "inventory", "view");
  return ok(await inventoryOverview());
});
