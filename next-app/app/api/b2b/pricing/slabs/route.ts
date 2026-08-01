/* /api/b2b/pricing/slabs — Admin / Super-Admin only. Quantity-slab ladders.
   GET  ?businessId=&productSlug=&unit=[&variantLabel=]  — the tier ladder (qty asc)
   POST { businessId, productSlug, productName, unit, variantLabel?, basePricePaise,
          gstBps?, effectiveFrom?, effectiveUntil?, tiers:[{minQty,b2bPricePaise}] }
        — replace the whole ladder atomically (upsert tiers given, drop the rest). */
import { NextRequest, NextResponse } from "next/server";
import { getSlabLadder, setSlabLadder } from "@/lib/b2b/pricing";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const businessId = sp.get("businessId"), productSlug = sp.get("productSlug"), unit = sp.get("unit");
  if (!businessId || !productSlug || !unit) return NextResponse.json({ error: "businessId, productSlug and unit are required" }, { status: 400 });
  try {
    const tiers = await getSlabLadder(businessId, productSlug, unit, sp.get("variantLabel"));
    return NextResponse.json({ tiers }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.pricing.slabs.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load slab ladder." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const tiers = await setSlabLadder(json, { actorId: actorId(req), actorRole: role });
    return NextResponse.json({ ok: true, tiers }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not save slab ladder" }, { status: 409 });
  }
}
