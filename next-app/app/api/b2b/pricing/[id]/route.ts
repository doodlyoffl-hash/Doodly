/* /api/b2b/pricing/[id] — Admin / Super-Admin only.
   GET                                                — pricing detail + change history
   PATCH { action: "update"|"delete"|"restore"|"enable"|"disable", ... } */
import { NextRequest, NextResponse } from "next/server";
import { getPricing, updatePricing, softDeletePricing, restorePricing, setPricingActive } from "@/lib/b2b/pricing";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const pricing = await getPricing(params.id);
    if (!pricing) return NextResponse.json({ error: "Pricing not found" }, { status: 404 });
    return NextResponse.json({ pricing }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.pricing.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load pricing." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const a = { actorId: actorId(req), actorRole: role };
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    switch (body.action) {
      case "update":
        return NextResponse.json({ ok: true, pricing: await updatePricing(params.id, body.patch, a) });
      case "delete":
        return NextResponse.json({ ok: true, pricing: await softDeletePricing(params.id, a) });
      case "restore":
        return NextResponse.json({ ok: true, pricing: await restorePricing(params.id, a) });
      case "enable":
        return NextResponse.json({ ok: true, pricing: await setPricingActive(params.id, true) });
      case "disable":
        return NextResponse.json({ ok: true, pricing: await setPricingActive(params.id, false) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
