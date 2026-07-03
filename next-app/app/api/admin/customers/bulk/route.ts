/* POST /api/admin/customers/bulk — bulk actions over selected customers.
   activate | deactivate | assign-exec | notify | export. customers:edit. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/customers/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { bulkAction } from "@/lib/customers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(["activate", "deactivate", "assign-exec", "notify", "export"]),
  executive: z.string().max(60).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(1000).optional(),
  channel: z.enum(["SMS", "WHATSAPP", "PUSH", "EMAIL"]).optional(),
});

export const POST = route("admin.customers.bulk", async (req: NextRequest) => {
  const role = requirePermission(req, "customers", "edit");
  const body = await parseBody(req, schema);
  const res = await bulkAction(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: `customer.bulk.${body.action}`, target: `${res.count} customers`, ctx: reqContext(req) });
  return ok({ result: res });
});
