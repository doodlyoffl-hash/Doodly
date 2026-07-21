/* /api/admin/milk/pnl — Milk Profit & Loss (procurement:view).
   GET ?date=YYYY-MM-DD&month=YYYY-MM → { daily, monthly }. Both default to
   today / current IST month. Revenue − COGS (FIFO) − Expenses. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { dailyPnl, monthlyPnl } from "@/lib/milk/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.pnl", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  const sp = req.nextUrl.searchParams;
  const [daily, monthly] = await Promise.all([
    dailyPnl(sp.get("date") ?? undefined),
    monthlyPnl(sp.get("month") ?? undefined),
  ]);
  return ok({ daily, monthly });
});
