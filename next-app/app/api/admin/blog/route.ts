/* /api/admin/blog — Content → Blog manager.
   GET  ?view=list|dashboard|detail  (+filters / id / preset / from / to)  → view perm
   POST { action: "create"|"update"|"publish"|"unpublish"|"schedule"|"archive"|"duplicate"|"delete"|"restore"|"bulk"|"log", … }
        mutations → manage (blogs:edit); log → view. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listBlogPosts, blogDashboard, blogDetail,
  createBlogPost, updateBlogPost, publishBlogPost, unpublishBlogPost, scheduleBlogPost, archiveBlogPost, duplicateBlogPost, softDeleteBlogPost, restoreBlogPost, bulkBlog,
} from "@/lib/blog/service";
import { actorRole, actorId, canViewBlog, canManageBlog } from "@/lib/blog/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "last7" | "last30" | "thisMonth" | "all";
function resolvePreset(p: Preset | null): { from?: string; to?: string } {
  if (!p || p === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (p) {
    case "today": return { from: iso(s), to: iso(s) };
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewBlog(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
  try {
    if (view === "dashboard") return NextResponse.json(await blogDashboard(), { headers: { "Cache-Control": "no-store" } });
    if (view === "detail") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ post: await blogDetail(id) }, { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json(await listBlogPosts({
      q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, category: sp.get("category") ?? undefined, author: sp.get("author") ?? undefined,
      sort: sp.get("sort") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")), from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to, includeDeleted: sp.get("includeDeleted") === "1",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.blog.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load blog posts." }, { status: 500 });
  }
}

const IdOnly = z.object({ id: z.string().min(1) });
export async function POST(req: NextRequest) {
  const role = actorRole(req);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const ctx = reqContext(req);
  const actor = { actorId: actorId(req), actorRole: role };
  if (action === "log") {
    if (!canViewBlog(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parts = [body.reportName && `“${body.reportName}”`, body.format && `[${body.format}]`].filter(Boolean).join(" ");
    await audit({ actorRole: role, action: `blog.${String(body.event ?? "generated")}`, target: parts || "blog", ctx });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!canManageBlog(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lifecycle: Record<string, (id: string) => Promise<unknown>> = { publish: publishBlogPost, unpublish: unpublishBlogPost, archive: archiveBlogPost, delete: softDeleteBlogPost, restore: restoreBlogPost };
  try {
    let result: unknown; let target = "";
    if (action === "create") { const p = await createBlogPost(body.data ?? body, actor); result = p; target = p.title; }
    else if (action === "update") { const { id } = IdOnly.parse(body); const p = await updateBlogPost(id, body.data ?? body); result = p; target = p.title; }
    else if (action === "duplicate") { const { id } = IdOnly.parse(body); const p = await duplicateBlogPost(id, actor); result = p; target = p.title; }
    else if (action === "schedule") { const b = z.object({ id: z.string().min(1), scheduledFor: z.string().min(1) }).parse(body); result = await scheduleBlogPost(b.id, b.scheduledFor); target = b.id; }
    else if (lifecycle[action]) { const { id } = IdOnly.parse(body); result = await lifecycle[action](id); target = id; }
    else if (action === "bulk") { const b = z.object({ bulkAction: z.enum(["publish", "unpublish", "archive", "delete", "restore"]), ids: z.array(z.string().min(1)).min(1).max(1000) }).parse(body); result = await bulkBlog(b.bulkAction, b.ids); target = `${b.ids.length} post(s) · ${b.bulkAction}`; }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `blog.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
