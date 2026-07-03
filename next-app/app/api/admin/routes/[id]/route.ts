/* /api/admin/routes/[id]
   GET    — full route detail: ordered stops + performance (routes:view)
   PATCH  — edit / code / zone / driver / active / notes / soft-delete-restore (routes:edit)
   DELETE — soft-delete (routes:delete). All audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { routeDetail, updateRoute } from "@/lib/routes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.routes.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "routes", "view");
  return ok({ route: await routeDetail(params.id) });
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  code: z.string().trim().max(30).nullable().optional(),
  date: z.string().datetime().optional(),
  driverId: z.string().min(1).nullable().optional(),
  zoneId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  deleted: z.boolean().optional(),
});

export const PATCH = route("admin.routes.update", async (req: NextRequest, { params }: Ctx) => {
  const body = await parseBody(req, patchSchema);
  const need = body.deleted != null ? "delete" : "edit";
  const role = requirePermission(req, "routes", need);
  const r = await updateRoute(params.id, body, { actorRole: role });
  const action = body.deleted === true ? "route.delete" : body.deleted === false ? "route.restore"
    : body.driverId !== undefined ? "route.assign_driver" : body.active != null ? "route.status" : "route.update";
  await audit({ actorRole: role, action, target: params.id, ctx: reqContext(req) });
  return ok({ route: r });
});

export const DELETE = route("admin.routes.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "routes", "delete");
  const r = await updateRoute(params.id, { deleted: true }, { actorRole: role });
  await audit({ actorRole: role, action: "route.delete", target: params.id, ctx: reqContext(req) });
  return ok({ route: r });
});
