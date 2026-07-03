/* /api/admin/products/[id] — one product, admin PIM view.
   GET    — full detail (products:view).
   PATCH  — action dispatch (products:edit): core update, pricing, seo,
            nutrition, quality, status, feature, restore, variant + image ops.
   DELETE — soft delete (products:delete). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import {
  getProductDetail, updateProduct, updatePricing, updateSeo, updateNutrition, updateQuality,
  setStatus, setFeatured, softDeleteProduct, restoreProduct,
  addVariant, updateVariant, deleteVariant, addImage, deleteImage, reorderImages, setFeaturedImage, type Actor,
} from "@/lib/products/service";
import { setRecoFlag, setRelated } from "@/lib/products/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.products.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "products", "view");
  const detail = await getProductDetail(params.id);
  if (!detail) throw Errors.notFound("Product not found.");
  return ok({ product: detail });
});

const variant = { label: z.string().max(40).optional(), displayName: z.string().max(60).optional(), sku: z.string().max(40).optional(), ml: z.number().int().positive().optional(), type: z.enum(["TRIAL", "SUBSCRIPTION"]).optional(), dailyPaise: z.number().int().nonnegative().optional(), fixedPaise: z.number().int().nonnegative().optional(), fixedDays: z.number().int().positive().optional(), stock: z.number().int().nonnegative().optional(), reservedStock: z.number().int().nonnegative().optional(), lowStockThreshold: z.number().int().nonnegative().optional(), weightG: z.number().int().nonnegative().optional(), barcode: z.string().max(40).optional(), active: z.boolean().optional() };

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().max(80).optional(), description: z.string().max(300).optional(), longDesc: z.string().max(4000).optional(), story: z.string().max(4000).optional(), usage: z.string().max(2000).optional(), storage: z.string().max(2000).optional(), ingredients: z.string().max(2000).optional(), allergens: z.string().max(500).optional(), categoryId: z.string().cuid().nullable().optional(), visible: z.boolean().optional(), imageUrl: z.string().url().nullable().optional(), sortOrder: z.number().int().min(0).max(9999).optional(), tags: z.array(z.string().max(30)).max(20).optional(), lowStockThreshold: z.number().int().min(0).optional() }),
  z.object({ action: z.literal("pricing"), mrpPaise: z.number().int().nonnegative().optional(), sellingPaise: z.number().int().nonnegative().optional(), costPaise: z.number().int().nonnegative().optional(), offerPaise: z.number().int().nonnegative().optional(), discountBps: z.number().int().min(0).max(10000).optional(), taxBps: z.number().int().min(0).max(10000).optional(), depositPaise: z.number().int().nonnegative().optional(), deliveryPaise: z.number().int().nonnegative().optional() }),
  z.object({ action: z.literal("seo"), metaTitle: z.string().max(120).optional(), metaDescription: z.string().max(300).optional(), ogImageUrl: z.string().url().optional().or(z.literal("")), canonicalUrl: z.string().url().optional().or(z.literal("")), keywords: z.array(z.string().max(40)).max(20).optional() }),
  z.object({ action: z.literal("nutrition") }).passthrough(),
  z.object({ action: z.literal("quality") }).passthrough(),
  z.object({ action: z.literal("status"), status: z.string() }),
  z.object({ action: z.literal("feature"), featured: z.boolean() }),
  z.object({ action: z.literal("reco-flag"), flag: z.enum(["featured", "bestSeller", "newArrival", "recommended"]), value: z.boolean() }),
  z.object({ action: z.literal("set-related"), slugs: z.array(z.string().max(50)).max(12) }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("add-variant"), ...variant }),
  z.object({ action: z.literal("update-variant"), variantId: z.string().min(1), ...variant }),
  z.object({ action: z.literal("delete-variant"), variantId: z.string().min(1) }),
  z.object({ action: z.literal("add-image"), url: z.string().url(), alt: z.string().max(120).optional() }),
  z.object({ action: z.literal("delete-image"), imageId: z.string().min(1) }),
  z.object({ action: z.literal("reorder-images"), imageIds: z.array(z.string().min(1)) }),
  z.object({ action: z.literal("set-featured-image"), imageId: z.string().min(1) }),
]);

export const PATCH = route("admin.products.action", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "products", "edit");
  const body = await parseBody(req, patchSchema);
  const id = params.id;
  const actor: Actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) };
  const clean = <T extends object>(o: T) => { const { action, ...rest } = o as T & { action: string }; return rest; };

  let result: unknown;
  switch (body.action) {
    case "update": result = await updateProduct(id, clean(body), actor); break;
    case "pricing": result = await updatePricing(id, clean(body), actor); break;
    case "seo": result = await updateSeo(id, clean(body) as Record<string, never>, actor); break;
    case "nutrition": result = await updateNutrition(id, clean(body) as Record<string, string>, actor); break;
    case "quality": result = await updateQuality(id, clean(body) as Record<string, string>, actor); break;
    case "status": result = await setStatus(id, body.status, actor); break;
    case "feature": result = await setFeatured(id, body.featured, actor); break;
    case "reco-flag": result = body.flag === "featured" ? await setFeatured(id, body.value, actor) : await setRecoFlag(id, body.flag, body.value); break;
    case "set-related": result = await setRelated(id, body.slugs); break;
    case "restore": result = await restoreProduct(id, actor); break;
    case "add-variant": result = await addVariant(id, clean(body), actor); break;
    case "update-variant": { const { variantId, ...rest } = clean(body) as { variantId: string }; result = await updateVariant(id, body.variantId, rest, actor); break; }
    case "delete-variant": result = await deleteVariant(id, body.variantId, actor); break;
    case "add-image": result = await addImage(id, body.url, body.alt, actor); break;
    case "delete-image": result = await deleteImage(id, body.imageId, actor); break;
    case "reorder-images": result = await reorderImages(id, body.imageIds, actor); break;
    case "set-featured-image": result = await setFeaturedImage(id, body.imageId, actor); break;
  }

  await audit({ actorRole: role, action: `product.${body.action}`, target: id, ctx: reqContext(req) });
  return ok({ result });
});

export const DELETE = route("admin.products.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "products", "delete");
  const actor: Actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) };
  const result = await softDeleteProduct(params.id, actor);
  await audit({ actorRole: role, action: "product.delete", target: params.id, ctx: reqContext(req) });
  return ok({ result });
});
