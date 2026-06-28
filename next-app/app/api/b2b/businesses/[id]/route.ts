/* /api/b2b/businesses/[id] — Admin / Super-Admin only.
   GET                                   — full business profile (stats + history)
   PATCH { action: "update"|"disable"|"enable"|"delete", ... }
        delete (soft) is Super-Admin only. */
import { NextRequest, NextResponse } from "next/server";
import { getBusinessProfile, updateBusiness, setBusinessActive, softDeleteBusiness } from "@/lib/b2b/service";
import { actorRole, canUseB2B, isSuperAdmin } from "@/lib/b2b/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!canUseB2B(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const profile = await getBusinessProfile(params.id);
    if (!profile) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("b2b.business.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load business." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const role = actorRole(req);
  if (!canUseB2B(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { action?: string; patch?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    switch (body.action) {
      case "update":
        return NextResponse.json({ ok: true, business: await updateBusiness(params.id, body.patch) });
      case "disable":
        return NextResponse.json({ ok: true, business: await setBusinessActive(params.id, false) });
      case "enable":
        return NextResponse.json({ ok: true, business: await setBusinessActive(params.id, true) });
      case "delete":
        if (!isSuperAdmin(role)) return NextResponse.json({ error: "Only a Super Admin can delete a business." }, { status: 403 });
        return NextResponse.json({ ok: true, business: await softDeleteBusiness(params.id) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
