/* POST /api/admin/procurement/bulk — bulk accept/reject/markPaid/markDue.
   RBAC: procurement:edit. Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { bulkProcurement } from "@/lib/procurement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["accept", "reject", "markPaid", "markDue"]),
  ids: z.array(z.string().min(1)).min(1).max(2000),
});

export const POST = route("admin.procurement.bulk", async (req: NextRequest) => {
  const role = requirePermission(req, "procurement", "edit");
  const body = await parseBody(req, schema);
  const res = await bulkProcurement(body, { actorRole: role });
  await audit({ actorRole: role, action: `procurement.bulk.${body.action}`, target: `${res.count} record(s)`, ctx: reqContext(req) });
  return ok(res);
});
