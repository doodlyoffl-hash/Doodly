/* POST /api/coupons/validate — real-time coupon validation for the storefront
   checkout (and admin preview). Public: the customer id (for first-order /
   per-customer-limit / customer-eligibility checks) is derived from the session.
   Returns { ok, reason, discountPaise, message } — the discount to apply BEFORE
   payment authorization. Redemption is recorded separately at order creation. */
import { NextRequest, NextResponse } from "next/server";
import { validateCouponForCart } from "@/lib/coupons/service";
import { readUserId } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const code = String(body.code ?? "").trim();
  if (!code) return NextResponse.json({ ok: false, reason: "not_found", discountPaise: 0, message: "Enter a coupon code." }, { status: 400 });
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
  try {
    const res = await validateCouponForCart(code, {
      orderTotalPaise: Math.max(0, Math.round(Number(body.orderTotalPaise) || 0)),
      userId: readUserId(req),
      productSlugs: arr(body.productSlugs), categorySlugs: arr(body.categorySlugs), planSlugs: arr(body.planSlugs),
    });
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("coupons.validate", (e as Error)?.message);
    return NextResponse.json({ ok: false, reason: "error", discountPaise: 0, message: "Could not validate coupon." }, { status: 500 });
  }
}
