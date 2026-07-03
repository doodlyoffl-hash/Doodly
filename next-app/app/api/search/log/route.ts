/* /api/search/log — fire-and-forget search analytics (query / click / noresult). */
import { NextRequest, NextResponse } from "next/server";
import { logSearchEvent } from "@/lib/search/service";
import { searchScope, currentUserId } from "@/lib/search/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const { kind, term, target } = b;
    if ((kind === "query" || kind === "click" || kind === "noresult") && term) {
      const clamp = (n: unknown) => (typeof n === "number" && isFinite(n) && n >= 0 ? Math.round(n) : undefined);
      await logSearchEvent(kind, String(term), target ? String(target) : undefined, searchScope(req), {
        resultCount: clamp(b.resultCount), durationMs: clamp(b.durationMs),
        userId: b.userId ? String(b.userId).slice(0, 60) : currentUserId(req) ?? undefined,
        sessionId: b.sessionId ? String(b.sessionId).slice(0, 60) : undefined,
        device: b.device ? String(b.device).slice(0, 20) : undefined,
        platform: b.platform ? String(b.platform).slice(0, 20) : "web",
      });
    }
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}
