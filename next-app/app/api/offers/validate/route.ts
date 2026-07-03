/* POST /api/offers/validate — storefront offer resolution.
   { code?, orderTotalPaise, productSlugs?, categorySlugs?, planSlugs? }
   - with `code`  → validate that specific offer.
   - without code → auto-apply: returns the best eligible offer (priority, then discount)
     + the full eligible list, so checkout can honour configurable priority rules.
   Public: customer id (first-order / per-customer-limit / eligibility) from the session. */
import { NextRequest, NextResponse } from "next/server";
import { validateOfferForCart, bestOffersForCart } from "@/lib/offers/service";
import { readUserId } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
  const cart = {
    orderTotalPaise: Math.max(0, Math.round(Number(body.orderTotalPaise) || 0)),
    userId: readUserId(req),
    productSlugs: arr(body.productSlugs), categorySlugs: arr(body.categorySlugs), planSlugs: arr(body.planSlugs),
  };
  try {
    const code = body.code ? String(body.code).trim() : "";
    if (code) return NextResponse.json(await validateOfferForCart(code, cart), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await bestOffersForCart(cart), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("offers.validate", (e as Error)?.message);
    return NextResponse.json({ ok: false, reason: "error", discountPaise: 0, message: "Could not resolve offers." }, { status: 500 });
  }
}
