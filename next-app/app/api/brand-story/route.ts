/* /api/brand-story — Brand Story CMS (RBAC: cms).
   GET  — current override (admin preview)
   PUT  — save override patch (marketing / admin / super-admin) */
import { NextRequest, NextResponse } from "next/server";
import { getBrandStoryOverride, setBrandStoryOverride } from "@/lib/brand-story/service";
import { actorRole, canEditBrandStory } from "@/lib/brand-story/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canEditBrandStory(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ override: await getBrandStoryOverride() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("brand-story.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load brand story config." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!canEditBrandStory(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, override: await setBrandStoryOverride(json) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not save" }, { status: 500 });
  }
}
