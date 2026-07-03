/* POST /api/admin/farmers/bulk — bulk activate/deactivate/assignRoute/delete/restore.
   RBAC: farmers:edit (delete/restore need :delete). Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { bulkFarmers } from "@/lib/farmers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["activate", "deactivate", "assignRoute", "delete", "restore"]),
  ids: z.array(z.string().min(1)).min(1).max(2000),
  route: z.string().nullable().optional(),
});

export const POST = route("admin.farmers.bulk", async (req: NextRequest) => {
  const body = await parseBody(req, schema);
  const need = body.action === "delete" || body.action === "restore" ? "delete" : "edit";
  const role = requirePermission(req, "farmers", need);
  const res = await bulkFarmers(body, { actorRole: role });
  await audit({ actorRole: role, action: `farmer.bulk.${body.action}`, target: `${res.count} farmer(s)`, ctx: reqContext(req) });
  return ok(res);
});
