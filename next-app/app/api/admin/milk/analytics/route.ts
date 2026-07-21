/* GET /api/admin/milk/analytics — Milk Operations KPI cards + settlement health
   (procurement:view). Feeds the Profit Center cards and the dashboard widget. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { milkCards, settlementHealth } from "@/lib/milk/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.analytics", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  const [cards, health] = await Promise.all([milkCards(), settlementHealth()]);
  return ok({ cards, health });
});
