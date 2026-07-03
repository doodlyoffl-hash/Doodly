/* /api/blog — public blog feed for the customer website (unauthenticated, read-only).
   GET            → published posts (also scheduled posts whose time has arrived)
   GET ?slug=…    → a single published post (increments its view counter)  */
import { NextRequest, NextResponse } from "next/server";
import { publicBlogFeed, blogDetail, incrementBlogView, blogStatus } from "@/lib/blog/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const slug = sp.get("slug");
  try {
    if (slug) {
      const post = await blogDetail(slug);
      if (post.deletedAt || blogStatus(post) === "Draft" || blogStatus(post) === "Archived") return NextResponse.json({ error: "Not found" }, { status: 404 });
      await incrementBlogView(slug);
      return NextResponse.json({ post }, { headers: { "Cache-Control": "no-store" } });
    }
    const limit = Math.min(60, Math.max(1, Number(sp.get("limit") ?? 30)));
    return NextResponse.json({ posts: await publicBlogFeed(limit) }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e) {
    if ((e as Error)?.message === "Post not found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("blog.public.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load posts." }, { status: 500 });
  }
}
