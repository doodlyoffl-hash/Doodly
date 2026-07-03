/* /api/admin/products/recommendations — recommendation control panel.
   GET  (products:view) → { enabled, products:[{id,slug,name,category,status,featured,bestSeller,newArrival,recommended,relatedSlugs}] }
   POST (products:edit) { enabled:boolean } → toggle the whole rail on/off.
   Per-product flags + related slugs are set via PATCH /api/admin/products/[id]
   (actions: reco-flag, set-related, feature). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { recoEnabled, setRecoEnabled } from "@/lib/products/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.products.reco.list", async (req: NextRequest) => {
  requirePermission(req, "products", "view");
  const [enabled, products] = await Promise.all([
    recoEnabled(),
    db.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, slug: true, name: true, category: true, status: true, visible: true,
        featured: true, bestSeller: true, newArrival: true, recommended: true, relatedSlugs: true,
        categoryRef: { select: { name: true } },
      },
    }),
  ]);
  return ok({ enabled, products: products.map((p) => ({ ...p, category: p.categoryRef?.name ?? p.category ?? null, categoryRef: undefined })) });
});

export const POST = route("admin.products.reco.toggle", async (req: NextRequest) => {
  const role = requirePermission(req, "products", "edit");
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  const result = await setRecoEnabled(enabled);
  await audit({ actorRole: role, action: "products.recommendations.toggle", target: "products.recommendations", ctx: reqContext(req) });
  return ok(result);
});
