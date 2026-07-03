/* /api/admin/delivery/pincodes/[id]
   PATCH  — edit / activate-deactivate (serviceableAreas:edit)
   DELETE — remove pincode (serviceableAreas:delete). Both audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { updatePincode, deletePincode } from "@/lib/delivery/pincodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  area: z.string().min(1).max(80).optional(),
  city: z.string().min(1).max(80).optional(),
  state: z.string().max(80).optional(),
  zoneId: z.string().nullable().optional(),
  charge: z.number().int().min(0).max(100000).optional(),
  slot: z.string().max(40).optional(),
  eta: z.string().max(40).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = route("admin.delivery.pincodes.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "serviceableAreas", "edit");
  const body = await parseBody(req, patchSchema);
  const pincode = await updatePincode(params.id, body, { actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "delivery.pincode.update", target: pincode.pincode, ctx: reqContext(req) });
  return ok({ pincode });
});

export const DELETE = route("admin.delivery.pincodes.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "serviceableAreas", "delete");
  const res = await deletePincode(params.id, { actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "delivery.pincode.delete", target: res.pincode, ctx: reqContext(req) });
  return ok(res);
});
