/* POST /api/admin/delivery/pincodes/bulk — bulk activate/deactivate/assignZone/
   delete(soft)/restore across many pincodes. RBAC: serviceableAreas:edit
   (delete/restore need :delete). Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { bulkPincodes } from "@/lib/delivery/pincodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["activate", "deactivate", "assignZone", "delete", "restore"]),
  ids: z.array(z.string().min(1)).min(1).max(2000),
  zoneId: z.string().nullable().optional(),
});

export const POST = route("admin.delivery.pincodes.bulk", async (req: NextRequest) => {
  const body = await parseBody(req, schema);
  const need = body.action === "delete" || body.action === "restore" ? "delete" : "edit";
  const role = requirePermission(req, "serviceableAreas", need);
  const res = await bulkPincodes(body, { actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: `delivery.pincode.bulk.${body.action}`, target: `${res.count} pincode(s)`, ctx: reqContext(req) });
  return ok(res);
});
