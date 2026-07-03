/* /api/admin/drivers/[id]
   GET   — full driver profile (drivers:view)
   PATCH — edit / assign zone / capacity / suspend / activate / soft-delete /
           restore (drivers:edit; delete/restore need :delete). Audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { driverDetail, updateDriver } from "@/lib/drivers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.drivers.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "drivers", "view");
  return ok({ driver: await driverDetail(params.id) });
});

const patchSchema = z.object({
  employeeId: z.string().trim().max(20).nullable().optional(),
  vehicleNo: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().optional(),
  zoneId: z.string().nullable().optional(),
  maxBottles: z.number().int().min(1).max(10000).optional(),
  suspended: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

export const PATCH = route("admin.drivers.update", async (req: NextRequest, { params }: Ctx) => {
  const body = await parseBody(req, patchSchema);
  const need = body.deleted != null ? "delete" : "edit";
  const role = requirePermission(req, "drivers", need);
  await updateDriver(params.id, body, { actorRole: role });
  const action = body.deleted === true ? "driver.delete" : body.deleted === false ? "driver.restore"
    : body.suspended != null ? "driver.suspend" : body.zoneId !== undefined ? "driver.assign_zone"
    : body.maxBottles != null ? "driver.capacity" : "driver.update";
  await audit({ actorRole: role, action, target: params.id, ctx: reqContext(req) });
  return ok({ driver: await driverDetail(params.id) });
});
