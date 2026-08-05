/* GET /api/puzzles/[id]/image — the puzzle's artwork as a real, cacheable image (public).
   The overview (/api/puzzles) now LINKS here (with a ?v=<updatedAt> version) instead of
   inlining a ~50KB base64 data URI on every poll, so the artwork is fetched once and served
   from browser/CDN cache. The image is stored on Puzzle.imageUrl as a base64 data URI (admin
   canvas upload); we decode it and stream the raw bytes. A plain http(s) URL just redirects. */
import { NextRequest, NextResponse } from "next/server";
import { route } from "@/lib/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("puzzles.image", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const p = await db.puzzle.findUnique({ where: { id: params.id }, select: { imageUrl: true } }).catch(() => null);
  const src = (p && p.imageUrl) || "";

  // Stored as a data URI (data:<mime>[;base64],<data>) — the admin-upload path.
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(src);
  if (m) {
    const mime = m[1] || "image/jpeg";
    const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(body.length),
        // The URL is versioned (?v=updatedAt) so a re-upload changes it → safe to cache hard.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // A real external image URL → redirect (already cacheable at source).
  if (/^https?:\/\//i.test(src)) return NextResponse.redirect(src, 302);

  // No custom artwork set → 404 (the client falls back to the built-in theme SVG).
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
});
