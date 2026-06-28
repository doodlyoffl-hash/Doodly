/* /api/search/log — fire-and-forget search analytics (query / click / noresult). */
import { NextRequest, NextResponse } from "next/server";
import { logSearchEvent } from "@/lib/search/service";
import { searchScope } from "@/lib/search/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { kind, term, target } = await req.json();
    if ((kind === "query" || kind === "click" || kind === "noresult") && term) {
      await logSearchEvent(kind, String(term), target ? String(target) : undefined, searchScope(req));
    }
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}
