/* /api/admin/cms — editable content blocks (hero, banners, FAQ, …).
   GET  — list (cms:view).
   POST — create a block with a JSON payload (cms:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.cms.list", async (req: NextRequest) => {
  requirePermission(req, "cms", "view");
  const blocks = await db.cmsBlock.findMany({ orderBy: { key: "asc" } });
  return ok({ blocks });
});

const createSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9._-]+$/i, "Use letters, numbers, dot, dash, underscore").min(2).max(60),
  type: z.string().trim().min(2).max(30),
  data: z.unknown().optional(),
  published: z.boolean().optional(),
});

export const POST = route("admin.cms.create", async (req: NextRequest) => {
  const role = requirePermission(req, "cms", "create");
  const body = await parseBody(req, createSchema);
  if (await db.cmsBlock.findUnique({ where: { key: body.key }, select: { id: true } })) throw Errors.conflict("A block with that key already exists.");
  const block = await db.cmsBlock.create({
    data: { key: body.key, type: body.type, data: (body.data ?? {}) as object, published: body.published ?? true },
  });
  await audit({ actorRole: role, action: "cms.create", target: block.id, ctx: reqContext(req) });
  return ok({ block }, { status: 201 });
});
