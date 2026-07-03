/* POST /api/admin/payments/bulk — bulk actions over selected payments.
   reconcile | receipts | export. payments:edit. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/payments/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { bulkPayments } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500), action: z.enum(["reconcile", "receipts", "export"]) });

export const POST = route("admin.payments.bulk", async (req: NextRequest) => {
  const role = requirePermission(req, "payments", "edit");
  const body = await parseBody(req, schema);
  const res = await bulkPayments(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: `payment.bulk.${body.action}`, target: `${res.count} payments`, ctx: reqContext(req) });
  return ok({ result: res });
});
