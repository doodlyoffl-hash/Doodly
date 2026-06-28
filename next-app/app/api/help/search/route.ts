/* /api/help/search — fire-and-forget search analytics (term + result count).
   Search itself is instant/client-side; this only logs for the admin report. */
import { NextRequest, NextResponse } from "next/server";
import { logSearch } from "@/lib/help/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { term, resultCount } = await req.json();
    await logSearch(String(term ?? ""), Number(resultCount ?? 0));
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}
