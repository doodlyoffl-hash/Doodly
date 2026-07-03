/* /api/products
   GET  — public catalogue (visible products + variants + pricing); staff with
          products:view get everything (incl. drafts/hidden).
   POST — create a product, optionally with pricing (products:create). */
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

export const GET = route("products.list", async (req: NextRequest) => {
  const role = readRole(req);
  const seeAll = can(role, "products", "view");
  const products = await db.product.findMany({
    where: seeAll ? {} : { visible: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      variants: { where: seeAll ? {} : { active: true }, orderBy: { ml: "asc" } },
      pricing: true,
      categoryRef: { select: { id: true, slug: true, name: true } },
    },
  });
  return ok({ products });
});

const PRODUCT_STATUS = ["AVAILABLE", "DRAFT", "COMING_SOON", "OUT_OF_STOCK", "DISCONTINUED", "HIDDEN", "ARCHIVED"] as const;

const createSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens").min(2).max(50),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(300),
  category: z.string().trim().max(40).optional(),
  categoryId: z.string().cuid().optional(),
  status: z.enum(PRODUCT_STATUS).optional(),
  visible: z.boolean().optional(),
  imageUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  pricing: z
    .object({
      mrpPaise: z.number().int().nonnegative(),
      sellingPaise: z.number().int().nonnegative(),
      depositPaise: z.number().int().nonnegative().optional(),
      taxBps: z.number().int().min(0).max(10000).optional(),
    })
    .optional(),
});

export const POST = route("products.create", async (req: NextRequest) => {
  const role = requirePermission(req, "products", "create");
  const body = await parseBody(req, createSchema);

  if (await db.product.findUnique({ where: { slug: body.slug } })) {
    throw Errors.conflict("A product with that slug already exists.");
  }
  if (body.categoryId && !(await db.category.findUnique({ where: { id: body.categoryId } }))) {
    throw Errors.badRequest("That category does not exist.");
  }

  const product = await db.product.create({
    data: {
      slug: body.slug,
      name: body.name,
      description: body.description,
      category: body.category ?? null,
      categoryId: body.categoryId ?? null,
      status: body.status ?? "COMING_SOON",
      visible: body.visible ?? true,
      imageUrl: body.imageUrl ?? null,
      sortOrder: body.sortOrder ?? 0,
      ...(body.pricing
        ? {
            pricing: {
              create: {
                mrpPaise: body.pricing.mrpPaise,
                sellingPaise: body.pricing.sellingPaise,
                depositPaise: body.pricing.depositPaise ?? 0,
                taxBps: body.pricing.taxBps ?? 0,
              },
            },
          }
        : {}),
    },
    include: { pricing: true, variants: true },
  });

  await audit({ actorRole: role, action: "product.create", target: product.id, ctx: reqContext(req) });
  return ok({ product }, { status: 201 });
});
