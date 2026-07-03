/* /api/admin/farmers/[id]
   GET    — full profile: collection + quality + payment history (farmers:view)
   PATCH  — edit / route / activate / deactivate / soft-delete-restore (farmers:edit)
   DELETE — soft-delete (farmers:delete). All audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { farmerDetail, updateFarmer } from "@/lib/farmers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.farmers.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "farmers", "view");
  return ok({ farmer: await farmerDetail(params.id) });
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  owner: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,15}$/).optional(),
  altPhone: z.string().trim().max(20).nullable().optional(),
  village: z.string().trim().min(2).max(60).optional(),
  mandal: z.string().trim().max(60).nullable().optional(),
  district: z.string().trim().max(60).nullable().optional(),
  state: z.string().trim().max(60).nullable().optional(),
  pincode: z.string().trim().max(10).nullable().optional(),
  route: z.string().trim().max(60).nullable().optional(),
  center: z.string().trim().max(60).nullable().optional(),
  ratePerLitre: z.number().int().nonnegative().optional(),
  notes: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

export const PATCH = route("admin.farmers.update", async (req: NextRequest, { params }: Ctx) => {
  const body = await parseBody(req, patchSchema);
  const need = body.deleted != null ? "delete" : "edit";
  const role = requirePermission(req, "farmers", need);
  await updateFarmer(params.id, body, { actorRole: role });
  const action = body.deleted === true ? "farmer.delete" : body.deleted === false ? "farmer.restore"
    : body.route !== undefined ? "farmer.route" : body.ratePerLitre != null ? "farmer.pricing" : body.active != null ? "farmer.status" : "farmer.update";
  await audit({ actorRole: role, action, target: params.id, ctx: reqContext(req) });
  return ok({ farmer: await farmerDetail(params.id) });
});

export const DELETE = route("admin.farmers.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "farmers", "delete");
  await updateFarmer(params.id, { deleted: true }, { actorRole: role });
  await audit({ actorRole: role, action: "farmer.delete", target: params.id, ctx: reqContext(req) });
  return ok({ deleted: true });
});
