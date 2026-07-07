/* POST /api/coupons/available — coupons the signed-in customer can see + apply
   for the current cart, each with a per-cart preview (discount or why-not).
   Customer id derives from the session (first-order / per-customer / eligibility).
   Read-only; nothing is redeemed here. */
import { NextRequest, NextResponse } from "next/server";
import { listAvailableCoupons } from "@/lib/coupons/service";
import { readUserId } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { body = {}; }
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
  try {
    const res = await listAvailableCoupons({
      orderTotalPaise: Math.max(0, Math.round(Number(body.orderTotalPaise) || 0)),
      userId: readUserId(req),
      productSlugs: arr(body.productSlugs), categorySlugs: arr(body.categorySlugs), planSlugs: arr(body.planSlugs),
    });
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("coupons.available", (e as Error)?.message);
    return NextResponse.json({ coupons: [] }, { status: 200 });
  }
}
