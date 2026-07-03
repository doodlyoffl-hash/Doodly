/* /api/admin/cms/[id]
   PATCH  — edit type / data / published (cms:edit)
   DELETE — remove a block (cms:delete). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  type: z.string().trim().min(2).max(30).optional(),
  data: z.unknown().optional(),
  published: z.boolean().optional(),
});

export const PATCH = route("admin.cms.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "cms", "edit");
  const body = await parseBody(req, patchSchema);
  if (!(await db.cmsBlock.findUnique({ where: { id: params.id }, select: { id: true } }))) throw Errors.notFound("Block not found.");
  const block = await db.cmsBlock.update({
    where: { id: params.id },
    data: {
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.data !== undefined ? { data: body.data as object } : {}),
      ...(body.published !== undefined ? { published: body.published } : {}),
    },
  });
  await audit({ actorRole: role, action: "cms.update", target: block.id, ctx: reqContext(req) });
  return ok({ block });
});

export const DELETE = route("admin.cms.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "cms", "delete");
  if (!(await db.cmsBlock.findUnique({ where: { id: params.id }, select: { id: true } }))) throw Errors.notFound("Block not found.");
  await db.cmsBlock.delete({ where: { id: params.id } });
  await audit({ actorRole: role, action: "cms.delete", target: params.id, ctx: reqContext(req) });
  return ok({ deleted: true });
});
