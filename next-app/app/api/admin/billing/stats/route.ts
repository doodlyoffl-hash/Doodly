/* GET /api/admin/billing/stats — billing dashboard KPIs. Admin + Super-Admin only. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireBillingAdmin } from "@/lib/billing/guard";
import { billingStats } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.billing.stats", async (req: NextRequest) => {
  requireBillingAdmin(req);
  return ok(await billingStats());
});
