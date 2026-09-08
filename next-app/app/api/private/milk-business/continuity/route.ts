/* GET /api/private/milk-business/continuity?view=chains|chain|preview|validate|weightedFat|order-allocation
   Read-only continuity-chain views for the private module (spec §22–24, §42, §26).
   Gated server-side on the milkBusiness RBAC module. */
import { NextRequest, NextResponse } from "next/server";
import { requireMilkBusiness } from "@/lib/milk-business/guard";
import { listActiveChains, getChain, continuityPreview, validateChainIntegrity, weightedActiveFat } from "@/lib/milk/continuity";
import { getOrderAllocations } from "@/lib/milk/order-allocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = requireMilkBusiness(req, "view");
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") || "chains";
  try {
    if (view === "chains") return NextResponse.json({ ok: true, chains: await listActiveChains() }, { headers: { "Cache-Control": "no-store" } });
    if (view === "chain") { const id = sp.get("chainId"); if (!id) return NextResponse.json({ error: "chainId required" }, { status: 400 }); return NextResponse.json({ ok: true, chain: await getChain(id) }, { headers: { "Cache-Control": "no-store" } }); }
    if (view === "preview") return NextResponse.json({ ok: true, preview: await continuityPreview(Number(sp.get("litres")) || 0, sp.get("fat") != null ? Number(sp.get("fat")) : undefined) }, { headers: { "Cache-Control": "no-store" } });
    if (view === "validate") return NextResponse.json({ ok: true, ...(await validateChainIntegrity()) }, { headers: { "Cache-Control": "no-store" } });
    if (view === "weightedFat") return NextResponse.json({ ok: true, ...(await weightedActiveFat()) }, { headers: { "Cache-Control": "no-store" } });
    if (view === "order-allocation") { const ref = sp.get("orderRef"); if (!ref) return NextResponse.json({ error: "orderRef required" }, { status: 400 }); return NextResponse.json({ ok: true, allocation: await getOrderAllocations(ref) }, { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (e) {
    console.error("mb.continuity.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load continuity data." }, { status: 500 });
  }
}
