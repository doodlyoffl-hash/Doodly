/* GET /api/admin/billing/options — data for the "Create billing" form. Admin + Super-Admin only.
   ?subscriptionId= (&wallet=) -> live billing preview for that subscription
   ?q=                         -> subscription search (id / customer / phone)
   (default)                   -> recent active subscriptions */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requireBillingAdmin } from "@/lib/billing/guard";
import { billingOptions, previewBilling } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.billing.options", async (req: NextRequest) => {
  requireBillingAdmin(req);
  const p = new URL(req.url).searchParams;
  const subscriptionId = p.get("subscriptionId");
  if (subscriptionId) {
    const wallet = p.get("wallet") ? Number(p.get("wallet")) : 0;
    return ok({ preview: await previewBilling(subscriptionId, wallet) });
  }
  return ok(await billingOptions(p.get("q") || undefined));
});
