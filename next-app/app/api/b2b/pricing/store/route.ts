/* /api/b2b/pricing/store — B2B negotiated pricing state, DB-backed & shared.
   GET → all pricing blobs { store, overrides, scheduled, history, settings }
         (Admin / Super-Admin).
   PUT { store?, overrides?, scheduled?, history?, settings? } → persist any
        provided blob. Pricing-config parts (store/scheduled/history/settings)
        are Super-Admin only; `overrides` (order-time price overrides) may be
        recorded by any B2B user.

   Replaces the old per-browser localStorage state in assets/js/b2b-pricing.js,
   so per-business negotiated prices, quantity slabs and order overrides persist
   across deploys, restarts and devices. Values are opaque JSON owned by the
   client. */
import { NextRequest, NextResponse } from "next/server";
import {
  getPricingBlobs, setPricingBlob, PRICING_PARTS, PRICING_SUPER_PARTS, type PricingPart,
} from "@/lib/b2b/pricing";
import { actorRole, actorId, canUseB2B, isSuperAdmin } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await getPricingBlobs(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.pricing.store.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load B2B pricing." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const body = (json ?? {}) as Record<string, unknown>;

  const parts = PRICING_PARTS.filter((p) => Object.prototype.hasOwnProperty.call(body, p));
  if (!parts.length) return NextResponse.json({ error: "No pricing data provided." }, { status: 422 });

  // Config parts require Super-Admin; only `overrides` is open to any B2B user.
  const needsSuper = parts.some((p) => PRICING_SUPER_PARTS.includes(p));
  if (needsSuper && !isSuperAdmin(role)) {
    return NextResponse.json({ error: "Only a Super Admin can change B2B pricing." }, { status: 403 });
  }

  try {
    const actor = { actorId: actorId(req), actorRole: role };
    for (const part of parts as PricingPart[]) await setPricingBlob(part, body[part], actor);
    return NextResponse.json(await getPricingBlobs());
  } catch (e) {
    console.error("b2b.pricing.store.put", (e as Error)?.message);
    return NextResponse.json({ error: "Could not save B2B pricing." }, { status: 500 });
  }
}
