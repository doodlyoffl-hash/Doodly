/* /api/private/milk-business/outlet/outlets — retail outlets + fixed pricing.
   GET  ?q=&includeInactive=1 | ?pricingFor=<id>
   POST { action: create|update|setPrice }
   Gated server-side on the milkBusiness RBAC module. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { listOutlets, createOutlet, updateOutlet, getOutletPricing, setOutletPrice } from "@/lib/milk-business/outlet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  try {
    const pricingFor = sp.get("pricingFor");
    if (pricingFor) return NextResponse.json({ ok: true, pricing: await getOutletPricing(pricingFor) }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, outlets: await listOutlets({ q: sp.get("q") ?? undefined, includeInactive: sp.get("includeInactive") === "1" }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("mb.outlet.outlets.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load outlets." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = requireMilkBusiness(req, "create");
  if (!g.ok) return g.res;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const actor = { userId: g.userId, role: g.role };
  try {
    if (action === "create") return NextResponse.json({ ok: true, outlet: await createOutlet(body as never, actor) });
    if (action === "update") { if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ok: true, outlet: await updateOutlet(String(body.id), body as never, actor) }); }
    if (action === "setPrice") { if (!body.outletId) return NextResponse.json({ error: "outletId required" }, { status: 400 }); return NextResponse.json({ ok: true, pricing: await setOutletPrice(String(body.outletId), Math.round(Number(body.pricePaise) || 0), (body.effectiveFrom as string) || undefined, actor) }); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
