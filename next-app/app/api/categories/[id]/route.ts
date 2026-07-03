/* /api/categories/[id]
   GET    — single category (categories:view)
   PATCH  — update (categories:edit)
   DELETE — remove (categories:delete); blocked if products are linked. */
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

export const GET = route("categories.get", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "categories", "view");
  const category = await db.category.findUnique({
    where: { id: params.id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw Errors.notFound("Category not found.");
  return ok({ category });
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

export const PATCH = route("categories.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "categories", "edit");
  const body = await parseBody(req, patchSchema);
  const existing = await db.category.findUnique({ where: { id: params.id } });
  if (!existing) throw Errors.notFound("Category not found.");
  const category = await db.category.update({ where: { id: params.id }, data: body });
  await audit({ actorRole: role, action: "category.update", target: category.id, ctx: reqContext(req) });
  return ok({ category });
});

export const DELETE = route("categories.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "categories", "delete");
  const existing = await db.category.findUnique({
    where: { id: params.id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) throw Errors.notFound("Category not found.");
  if (existing._count.products > 0) {
    throw Errors.conflict("Reassign or remove its products before deleting this category.");
  }
  await db.category.delete({ where: { id: params.id } });
  await audit({ actorRole: role, action: "category.delete", target: params.id, ctx: reqContext(req) });
  return ok({ deleted: true });
});
