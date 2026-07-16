/* GET /api/admin/deliveries/calendar?month=YYYY-MM — the admin Delivery Calendar.
   Per-IST-day totals (total / pending / assigned / out / completed / failed /
   unassigned + bottles + real litres) for the month, straight from Delivery rows.
   Defaults to the current IST month. RBAC deliveries:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { deliveryCalendar } from "@/lib/delivery/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.deliveries.calendar", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const month = new URL(req.url).searchParams.get("month");
  return ok(await deliveryCalendar(month));
});
