/* GET /api/admin/billing/reports — billing analytics + CSV rows. Admin + Super-Admin only.
   Optional ?from= & ?to= (ISO) windows by billing date. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireBillingAdmin } from "@/lib/billing/guard";
import { billingReports } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.billing.reports", async (req: NextRequest) => {
  requireBillingAdmin(req);
  const p = new URL(req.url).searchParams;
  return ok(await billingReports({ dateFrom: p.get("from") || undefined, dateTo: p.get("to") || undefined }));
});
