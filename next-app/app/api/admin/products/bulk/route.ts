/* POST /api/admin/products/bulk — bulk actions + import.
   activate | deactivate | delete | category | price | stock | export (products:edit),
   import (products:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { bulkProducts, importProducts, type Actor } from "@/lib/products/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["activate", "deactivate", "delete", "export"]), ids: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({ action: z.literal("category"), ids: z.array(z.string().min(1)).min(1).max(500), categoryId: z.string().cuid() }),
  z.object({ action: z.literal("price"), ids: z.array(z.string().min(1)).min(1).max(500), discountBps: z.number().int().min(0).max(10000).optional(), sellingPaise: z.number().int().nonnegative().optional() }),
  z.object({ action: z.literal("stock"), ids: z.array(z.string().min(1)).min(1).max(500), stock: z.number().int().nonnegative().optional(), stockDelta: z.number().int().optional() }),
  z.object({ action: z.literal("import"), rows: z.array(z.object({ slug: z.string().min(1), name: z.string().min(1), description: z.string().optional(), categorySlug: z.string().optional(), status: z.string().optional(), mrpPaise: z.number().int().optional(), sellingPaise: z.number().int().optional(), taxBps: z.number().int().optional() })).min(1).max(500) }),
]);

export const POST = route("admin.products.bulk", async (req: NextRequest) => {
  const peek = await req.clone().json().catch(() => ({}));
  const role = requirePermission(req, "products", peek?.action === "import" ? "create" : "edit");
  const body = await parseBody(req, schema);
  const actor: Actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) };

  if (body.action === "import") {
    const res = await importProducts(body.rows, actor);
    await audit({ actorRole: role, action: "product.bulk.import", target: `${res.created + res.updated} products`, ctx: reqContext(req) });
    return ok({ result: res });
  }
  const res = await bulkProducts(body, actor);
  await audit({ actorRole: role, action: `product.bulk.${body.action}`, target: `${res.count} products`, ctx: reqContext(req) });
  return ok({ result: res });
});
