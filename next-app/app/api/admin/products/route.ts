/* /api/admin/products — admin Products (PIM) list + create.
   GET  — filter / sort / paginate (products:view → Admin, Super-Admin).
   POST — create a product (products:create). The public storefront keeps using
          /api/products; this is the admin/ERP surface. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listProducts, createProduct, type ListArgs } from "@/lib/products/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.products.list", async (req: NextRequest) => {
  requirePermission(req, "products", "view");
  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  const args: ListArgs = {
    status: p.get("status") || undefined,
    visible: p.get("visible") || undefined,
    featured: p.get("featured") || undefined,
    stockState: p.get("stock") || undefined,
    categoryId: p.get("category") || undefined,
    variantType: p.get("variantType") || undefined,
    dateFrom: p.get("from") || undefined,
    dateTo: p.get("to") || undefined,
    q: p.get("q") || undefined,
    sort: p.get("sort") || undefined,
    dir: (p.get("dir") as "asc" | "desc") || undefined,
    page: num("page"),
    pageSize: num("pageSize"),
  };
  return ok(await listProducts(args));
});

const createSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens").min(2).max(50),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(300),
  categoryId: z.string().cuid().optional(),
  status: z.enum(["AVAILABLE", "DRAFT", "COMING_SOON", "OUT_OF_STOCK", "DISCONTINUED", "HIDDEN"]).optional(),
  visible: z.boolean().optional(),
  featured: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  pricing: z.object({ mrpPaise: z.number().int().nonnegative(), sellingPaise: z.number().int().nonnegative(), discountBps: z.number().int().min(0).max(10000).optional(), taxBps: z.number().int().min(0).max(10000).optional(), depositPaise: z.number().int().nonnegative().optional() }).optional(),
  variants: z.array(z.object({ label: z.string().min(1).max(40), ml: z.number().int().positive(), type: z.enum(["TRIAL", "SUBSCRIPTION"]).optional(), sku: z.string().max(40).optional(), dailyPaise: z.number().int().nonnegative().optional(), fixedPaise: z.number().int().nonnegative().optional(), fixedDays: z.number().int().positive().optional(), stock: z.number().int().nonnegative().optional(), weightG: z.number().int().nonnegative().optional() })).max(10).optional(),
});

export const POST = route("admin.products.create", async (req: NextRequest) => {
  const role = requirePermission(req, "products", "create");
  const body = await parseBody(req, createSchema);
  const res = await createProduct(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "product.create", target: res.id, ctx: reqContext(req) });
  return ok({ product: res }, { status: 201 });
});
