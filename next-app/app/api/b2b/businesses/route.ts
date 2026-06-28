/* /api/b2b/businesses — Admin / Super-Admin only.
   GET  ?q=…&includeInactive=1   — search / list businesses (lookup)
   POST { ...business }          — register a new business (auto Business ID) */
import { NextRequest, NextResponse } from "next/server";
import { registerBusiness, lookupBusinesses } from "@/lib/b2b/service";
import { actorRole, actorId, canUseB2B } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sp = req.nextUrl.searchParams;
    const businesses = await lookupBusinesses(sp.get("q") ?? undefined, {
      includeInactive: sp.get("includeInactive") === "1",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ businesses }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.businesses.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load businesses." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const business = await registerBusiness(json, { actorId: actorId(req), actorRole: role });
    return NextResponse.json({ ok: true, business }, { status: 201 });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not register business" }, { status: 409 });
  }
}
