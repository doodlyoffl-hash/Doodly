/* /api/products/[id]
   GET    — single product (public if visible; staff see all)
   PATCH  — update core fields (products:edit)
   DELETE — archive (soft) the product (products:delete). */
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

type Ctx = { params: { id: string } };

export const GET = route("products.get", async (req: NextRequest, { params }: Ctx) => {
  const product = await db.product.findUnique({
    where: { id: params.id },
    include: { variants: true, pricing: true, categoryRef: { select: { id: true, slug: true, name: true } } },
  });
  if (!product) throw Errors.notFound("Product not found.");
  if (!product.visible && !can(readRole(req), "products", "view")) throw Errors.notFound("Product not found.");
  return ok({ product });
});

const PRODUCT_STATUS = ["AVAILABLE", "DRAFT", "COMING_SOON", "OUT_OF_STOCK", "DISCONTINUED", "HIDDEN", "ARCHIVED"] as const;

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().max(40).nullable().optional(),
  categoryId: z.string().cuid().nullable().optional(),
  status: z.enum(PRODUCT_STATUS).optional(),
  visible: z.boolean().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const PATCH = route("products.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "products", "edit");
  const body = await parseBody(req, patchSchema);
  if (!(await db.product.findUnique({ where: { id: params.id }, select: { id: true } }))) {
    throw Errors.notFound("Product not found.");
  }
  if (body.categoryId && !(await db.category.findUnique({ where: { id: body.categoryId } }))) {
    throw Errors.badRequest("That category does not exist.");
  }
  const product = await db.product.update({
    where: { id: params.id },
    data: body,
    include: { pricing: true, categoryRef: { select: { id: true, slug: true, name: true } } },
  });
  await audit({ actorRole: role, action: "product.update", target: product.id, ctx: reqContext(req) });
  return ok({ product });
});

export const DELETE = route("products.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "products", "delete");
  if (!(await db.product.findUnique({ where: { id: params.id }, select: { id: true } }))) {
    throw Errors.notFound("Product not found.");
  }
  // Soft delete: archive + hide (keeps order/variant history intact).
  const product = await db.product.update({
    where: { id: params.id },
    data: { status: "ARCHIVED", visible: false },
    select: { id: true, status: true, visible: true },
  });
  await audit({ actorRole: role, action: "product.archive", target: product.id, ctx: reqContext(req) });
  return ok({ product });
});
