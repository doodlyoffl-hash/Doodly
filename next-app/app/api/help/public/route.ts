/* /api/help/public — public read of the published Help Center knowledge base.
   GET → { cats:[{id,icon,title,faqs:[{q,a,published}]}], videos:[{id,title,url}] }
   Powers storefront Help Center hydration (assets/js/help.js). Unauthenticated;
   admin edits via /api/help/admin reflect here on the next load. */
import { NextResponse } from "next/server";
import { helpPublicData } from "@/lib/help/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await helpPublicData();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("help.public.get", (e as Error)?.message);
    return NextResponse.json({ cats: [], videos: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
