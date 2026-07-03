/* /api/b2b/pricing — Admin / Super-Admin only.
   GET  ?businessId=&productSlug=&active=&q=&priceFrom=&priceTo=&sort=&limit=&offset=&includeDeleted=
   POST { ...pricing }  — create a per-business pricing rule (auto B2BP code). */
import { NextRequest, NextResponse } from "next/server";
import { listPricing, createPricing, type PricingSort } from "@/lib/b2b/pricing";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const active = sp.get("active");
    const result = await listPricing({
      businessId: sp.get("businessId") ?? undefined,
      productSlug: sp.get("productSlug") ?? undefined,
      active: active === "1" ? true : active === "0" ? false : undefined,
      q: sp.get("q") ?? undefined,
      priceFromPaise: sp.get("priceFrom") ? Math.round(Number(sp.get("priceFrom")) * 100) : undefined,
      priceToPaise: sp.get("priceTo") ? Math.round(Number(sp.get("priceTo")) * 100) : undefined,
      includeDeleted: sp.get("includeDeleted") === "1",
      sort: (sp.get("sort") as PricingSort) ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.pricing.list", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load pricing." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const pricing = await createPricing(json, { actorId: actorId(req), actorRole: role });
    return NextResponse.json({ ok: true, pricing }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not create pricing" }, { status: 409 });
  }
}
