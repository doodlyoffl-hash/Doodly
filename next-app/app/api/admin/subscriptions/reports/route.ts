/* GET /api/admin/subscriptions/reports — analytics + CSV rows. Admin + Super-Admin only.
   Optional ?from= & ?to= (ISO) windows the report by subscription start date. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireSubsAdmin } from "@/lib/subscriptions/guard";
import { subscriptionReports } from "@/lib/subscriptions/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.subscriptions.reports", async (req: NextRequest) => {
  requireSubsAdmin(req);
  const p = new URL(req.url).searchParams;
  return ok(await subscriptionReports({ dateFrom: p.get("from") || undefined, dateTo: p.get("to") || undefined }));
});
