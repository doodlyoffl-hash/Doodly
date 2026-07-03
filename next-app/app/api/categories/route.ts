/* /api/categories
   GET  — public sees active categories; staff with categories:view see all.
   POST — create a category (categories:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { can } from "@/lib/rbac";
import { readRole } from "@/lib/auth/identity";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("categories.list", async (req: NextRequest) => {
  const role = readRole(req);
  const seeAll = can(role, "categories", "view");
  const categories = await db.category.findMany({
    where: seeAll ? {} : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return ok({ categories });
});

const createSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens").min(2).max(40),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(280).optional(),
  imageUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

export const POST = route("categories.create", async (req: NextRequest) => {
  const role = requirePermission(req, "categories", "create");
  const body = await parseBody(req, createSchema);

  const exists = await db.category.findUnique({ where: { slug: body.slug } });
  if (exists) throw Errors.conflict("A category with that slug already exists.");

  const category = await db.category.create({
    data: {
      slug: body.slug, name: body.name, description: body.description ?? null,
      imageUrl: body.imageUrl ?? null, sortOrder: body.sortOrder ?? 0, active: body.active ?? true,
    },
  });
  await audit({ actorRole: role, action: "category.create", target: category.id, ctx: reqContext(req) });
  return ok({ category }, { status: 201 });
});
