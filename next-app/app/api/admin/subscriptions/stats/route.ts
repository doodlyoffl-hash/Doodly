/* GET /api/admin/subscriptions/stats — dashboard KPIs. Admin + Super-Admin only. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireSubsAdmin } from "@/lib/subscriptions/guard";
import { subscriptionStats } from "@/lib/subscriptions/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.subscriptions.stats", async (req: NextRequest) => {
  requireSubsAdmin(req);
  return ok(await subscriptionStats());
});
