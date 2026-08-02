/* /api/admin/milk/drilldown — Profit Centre order + tanker drill-down (procurement:view).
   GET ?view=day&date=YYYY-MM-DD   → { date, orders[], tankers[], … }  (day-anchored)
   GET ?view=tankers               → { tankers[] }                     (tanker list)
   GET ?view=tanker&tankerId=…     → { draws[] }                       (one tanker's per-day history) */
import { NextRequest } from "next/server";
import { ok, Errors, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { dayDrilldown, tankerList, tankerDraws } from "@/lib/milk/drilldown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.milk.drilldown", async (req: NextRequest) => {
  requirePermission(req, "procurement", "view");
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "day";
  if (view === "tankers") return ok({ tankers: await tankerList() });
  if (view === "tanker") {
    const id = sp.get("tankerId");
    if (!id) throw Errors.badRequest("tankerId required");
    return ok({ draws: await tankerDraws(id) });
  }
  const from = sp.get("from") ?? sp.get("date") ?? undefined;
  const to = sp.get("to") ?? sp.get("date") ?? from;
  return ok(await dayDrilldown(from, to));
});
