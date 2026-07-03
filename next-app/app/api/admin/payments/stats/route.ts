/* GET /api/admin/payments/stats — dashboard KPIs (payments:view). */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { paymentStats } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.payments.stats", async (req: NextRequest) => {
  requirePermission(req, "payments", "view");
  return ok(await paymentStats());
});
