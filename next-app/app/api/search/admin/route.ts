/* /api/search/admin — search insights + trending management (RBAC: cms).
   GET  ?view=analytics|trending
   POST { action: "add"|"remove"|"toggle", ... } */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchAnalytics, searchInsights, listSearchRecords, listTrending, addTrending, removeTrending, toggleTrending } from "@/lib/search/service";
import { actorRole, canManageSearch, canViewSearch } from "@/lib/search/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "fy" | "all";
function resolvePreset(p: Preset | null): { from?: string; to?: string } {
  if (!p || p === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (p) {
    case "today": return { from: iso(s), to: iso(s) };
    case "yesterday": { const y = new Date(s); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    case "lastMonth": { const f = new Date(now.getFullYear(), now.getMonth() - 1, 1); const t = new Date(now.getFullYear(), now.getMonth(), 0); return { from: iso(f), to: iso(t) }; }
    case "fy": { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "analytics";
  // trending management list needs manage; everything else needs view.
  if (view === "trending") { if (!canManageSearch(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  else if (!canViewSearch(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
    const from = sp.get("from") ?? range.from, to = sp.get("to") ?? range.to;
    if (view === "trending") return NextResponse.json({ trending: await listTrending() }, { headers: { "Cache-Control": "no-store" } });
    if (view === "dashboard") return NextResponse.json(await searchInsights({ from, to }), { headers: { "Cache-Control": "no-store" } });
    if (view === "records") {
      return NextResponse.json(await listSearchRecords({
        from, to, kind: sp.get("kind") ?? undefined, scope: sp.get("scope") ?? undefined, device: sp.get("device") ?? undefined,
        q: sp.get("q") ?? undefined, sort: sp.get("sort") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")),
      }), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await searchAnalytics(), { headers: { "Cache-Control": "no-store" } }); // legacy
  } catch (e) {
    console.error("search.admin.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load search data." }, { status: 500 });
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), term: z.string().min(2) }),
  z.object({ action: z.literal("remove"), id: z.string().min(1) }),
  z.object({ action: z.literal("toggle"), id: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("log"), event: z.enum(["generated", "exported", "printed", "filtered", "refreshed", "reindexed"]), reportName: z.string().max(120).optional(), filters: z.string().max(300).optional(), format: z.string().max(20).optional() }),
]);

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const d = parsed.data;
  // Audit logging of an export/refresh needs only view; trending mutations need manage.
  if (d.action === "log") {
    if (!canViewSearch(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parts = [d.reportName && `“${d.reportName}”`, d.format && `[${d.format}]`, d.filters && `(${d.filters})`].filter(Boolean).join(" ");
    await audit({ actorRole: role, action: `search.${d.event}`, target: parts || "search insights", ctx: reqContext(req) });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!canManageSearch(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = d.action === "add" ? await addTrending(d.term) : d.action === "remove" ? await removeTrending(d.id) : await toggleTrending(d.id, d.active);
    await audit({ actorRole: role, action: `search.trending.${d.action}`, target: "action" in d ? d.action : "", ctx: reqContext(req) });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
