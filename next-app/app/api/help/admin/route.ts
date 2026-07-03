/* /api/help/admin — Help Center CMS (RBAC: cms).
   GET  ?view=articles|analytics
   POST { action: "create"|"update"|"delete"|"publish"|"reorder", ... } */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  helpAdminData, helpAnalytics, createArticle, updateArticle, deleteArticle, setPublished, reorderArticles,
  createCategory, renameCategory, deleteCategory, reorderCategories, createVideo, updateVideo, deleteVideo,
} from "@/lib/help/service";
import { actorRole, canManageHelp } from "@/lib/help/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canManageHelp(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const view = req.nextUrl.searchParams.get("view") ?? "articles";
    if (view === "analytics") return NextResponse.json(await helpAnalytics(), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await helpAdminData(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("help.admin.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load help data." }, { status: 500 });
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), category: z.string().min(1), question: z.string().min(3), answer: z.string().min(3), keywords: z.array(z.string()).optional(), published: z.boolean().optional() }),
  z.object({ action: z.literal("update"), id: z.string().min(1), category: z.string().optional(), question: z.string().optional(), answer: z.string().optional(), keywords: z.array(z.string()).optional(), published: z.boolean().optional(), videoUrl: z.string().nullable().optional() }),
  z.object({ action: z.literal("delete"), id: z.string().min(1) }),
  z.object({ action: z.literal("publish"), id: z.string().min(1), published: z.boolean() }),
  z.object({ action: z.literal("reorder"), items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })) }),
  // categories
  z.object({ action: z.literal("catCreate"), title: z.string().min(1), icon: z.string().optional() }),
  z.object({ action: z.literal("catRename"), id: z.string().min(1), title: z.string().min(1) }),
  z.object({ action: z.literal("catDelete"), id: z.string().min(1) }),
  z.object({ action: z.literal("catReorder"), items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })) }),
  // videos
  z.object({ action: z.literal("vidCreate"), title: z.string().min(1), url: z.string().optional() }),
  z.object({ action: z.literal("vidUpdate"), id: z.string().min(1), title: z.string().optional(), url: z.string().optional() }),
  z.object({ action: z.literal("vidDelete"), id: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  if (!canManageHelp(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  try {
    const d = parsed.data;
    let result: unknown;
    switch (d.action) {
      case "create": result = await createArticle(d); break;
      case "update": result = await updateArticle(d.id, d); break;
      case "delete": result = await deleteArticle(d.id); break;
      case "publish": result = await setPublished(d.id, d.published); break;
      case "reorder": result = await reorderArticles(d.items); break;
      case "catCreate": result = await createCategory(d.title, d.icon); break;
      case "catRename": result = await renameCategory(d.id, d.title); break;
      case "catDelete": result = await deleteCategory(d.id); break;
      case "catReorder": result = await reorderCategories(d.items); break;
      case "vidCreate": result = await createVideo(d.title, d.url); break;
      case "vidUpdate": result = await updateVideo(d.id, d); break;
      case "vidDelete": result = await deleteVideo(d.id); break;
      default: result = null;
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
