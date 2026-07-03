/* /api/cms/page — public read of published CMS content blocks for a page.
   GET ?prefix=about  → { blocks: [{ key, type, data }] }  (published only)
   Powers CMS-hydration of storefront pages (About / Farmers / Bottle-Returns …).
   Unauthenticated + cacheable; editing is admin-only via /api/admin/cms. */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const prefix = (req.nextUrl.searchParams.get("prefix") || "").trim();
  if (!prefix || !/^[a-z0-9._-]+$/i.test(prefix)) return NextResponse.json({ error: "prefix required" }, { status: 400 });
  try {
    const rows = await db.cmsBlock.findMany({ where: { published: true, key: { startsWith: prefix + "." } }, select: { key: true, type: true, data: true }, orderBy: { key: "asc" } });
    return NextResponse.json({ blocks: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("cms.page.get", (e as Error)?.message);
    return NextResponse.json({ blocks: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
