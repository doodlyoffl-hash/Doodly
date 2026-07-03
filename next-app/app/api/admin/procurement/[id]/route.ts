/* PATCH /api/admin/procurement/[id] — accept or reject a collected batch
   (procurement:edit). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { procurementDetail } from "@/lib/procurement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.procurement.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "procurement", "view");
  return ok({ procurement: await procurementDetail(params.id) });
});

const patchSchema = z.object({ accepted: z.boolean() });

export const PATCH = route("admin.procurement.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "procurement", "edit");
  const body = await parseBody(req, patchSchema);
  if (!(await db.procurement.findUnique({ where: { id: params.id }, select: { id: true } }))) throw Errors.notFound("Batch not found.");
  const procurement = await db.procurement.update({
    where: { id: params.id },
    data: { accepted: body.accepted },
    select: { id: true, accepted: true },
  });
  await audit({ actorRole: role, action: body.accepted ? "procurement.accept" : "procurement.reject", target: procurement.id, ctx: reqContext(req) });
  return ok({ procurement });
});
