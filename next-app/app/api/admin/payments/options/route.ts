/* GET /api/admin/payments/options — data for the "Record payment" form.
   ?q=      -> customer search;  ?userId= -> that customer's payable orders/billings/subs.
   payments:view. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { recordOptions } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.payments.options", async (req: NextRequest) => {
  requirePermission(req, "payments", "view");
  const p = new URL(req.url).searchParams;
  return ok(await recordOptions(p.get("q") ?? undefined, p.get("userId") ?? undefined));
});
