/* POST /api/admin/routes/bulk — bulk activate/deactivate/assignDriver/delete/restore.
   RBAC: routes:edit (delete/restore need :delete). Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { bulkRoutes } from "@/lib/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["activate", "deactivate", "assignDriver", "delete", "restore"]),
  ids: z.array(z.string().min(1)).min(1).max(1000),
  driverId: z.string().nullable().optional(),
});

export const POST = route("admin.routes.bulk", async (req: NextRequest) => {
  const body = await parseBody(req, schema);
  const need = body.action === "delete" || body.action === "restore" ? "delete" : "edit";
  const role = requirePermission(req, "routes", need);
  const res = await bulkRoutes(body, { actorRole: role });
  await audit({ actorRole: role, action: `route.bulk.${body.action}`, target: `${res.count} route(s)`, ctx: reqContext(req) });
  return ok(res);
});
