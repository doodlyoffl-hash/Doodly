/* /api/search/admin — search insights + trending management (RBAC: cms).
   GET  ?view=analytics|trending
   POST { action: "add"|"remove"|"toggle", ... } */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchAnalytics, listTrending, addTrending, removeTrending, toggleTrending } from "@/lib/search/service";
import { actorRole, canManageSearch } from "@/lib/search/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canManageSearch(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const view = req.nextUrl.searchParams.get("view") ?? "analytics";
    if (view === "trending") return NextResponse.json({ trending: await listTrending() }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await searchAnalytics(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("search.admin.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load search data." }, { status: 500 });
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), term: z.string().min(2) }),
  z.object({ action: z.literal("remove"), id: z.string().min(1) }),
  z.object({ action: z.literal("toggle"), id: z.string().min(1), active: z.boolean() }),
]);

export async function POST(req: NextRequest) {
  if (!canManageSearch(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  try {
    const d = parsed.data;
    const result = d.action === "add" ? await addTrending(d.term) : d.action === "remove" ? await removeTrending(d.id) : await toggleTrending(d.id, d.active);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
