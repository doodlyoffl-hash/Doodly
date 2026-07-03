/* /api/products/related — public related-products rail for a product detail page.
   GET ?slug=milk (or ?product=milk) &limit=8 →
     { ok, enabled, reason, products:[{id,slug,name,category,imageUrl,status,
       featured,bestSeller,newArrival,recommended,comingSoon,ratingValue,ratingCount,priceFromPaise,reason}] }
   Unauthenticated; admin recommendation edits reflect on the next load. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { relatedProducts } from "@/lib/products/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("products.related", async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("slug") || sp.get("product") || "").trim().toLowerCase();
  const raw = parseInt(sp.get("limit") || "8", 10);
  const limit = Math.min(Math.max(Number.isNaN(raw) ? 8 : raw, 1), 20);
  return ok(await relatedProducts(slug, limit));
});
