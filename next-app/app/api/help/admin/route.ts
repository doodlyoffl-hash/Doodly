/* /api/help/admin — Help Center CMS (RBAC: cms).
   GET  ?view=articles|analytics
   POST { action: "create"|"update"|"delete"|"publish"|"reorder", ... } */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listAllArticles, helpAnalytics, createArticle, updateArticle, deleteArticle, setPublished, reorderArticles,
} from "@/lib/help/service";
import { actorRole, canManageHelp } from "@/lib/help/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canManageHelp(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const view = req.nextUrl.searchParams.get("view") ?? "articles";
    if (view === "analytics") return NextResponse.json(await helpAnalytics(), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ articles: await listAllArticles() }, { headers: { "Cache-Control": "no-store" } });
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
]);

export async function POST(req: NextRequest) {
  if (!canManageHelp(actorRole(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  try {
    const d = parsed.data;
    const result =
      d.action === "create" ? await createArticle(d)
      : d.action === "update" ? await updateArticle(d.id, d)
      : d.action === "delete" ? await deleteArticle(d.id)
      : d.action === "publish" ? await setPublished(d.id, d.published)
      : await reorderArticles(d.items);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
