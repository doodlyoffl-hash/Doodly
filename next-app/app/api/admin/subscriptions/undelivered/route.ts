/* /api/admin/subscriptions/undelivered — subscriptions with past-dated undelivered paid
   days, valued + with a recommended remedy. Admin + Super-Admin only. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireSubsAdmin } from "@/lib/subscriptions/guard";
import { listUndelivered } from "@/lib/subscriptions/undelivered";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.subscriptions.undelivered.list", async (req: NextRequest) => {
  requireSubsAdmin(req);
  const subscriptions = await listUndelivered();
  return ok({ subscriptions, count: subscriptions.length });
});
