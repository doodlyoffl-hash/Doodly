/* /api/admin/milk/inventory — live FIFO inventory: open lots, carry-forward,
   and a valuation of milk on hand (procurement:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getInventory } from "@/lib/milk/tanker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.inventory", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  return ok(await getInventory());
});
