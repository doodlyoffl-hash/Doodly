/* /api/search?q= — dynamic results (a customer's orders, admin records) merged
   into the palette alongside the instant client-side static index. Scope-aware
   and failure-tolerant. */
import { NextRequest, NextResponse } from "next/server";
import { dynamicSearch } from "@/lib/search/service";
import { searchScope, currentUserId } from "@/lib/search/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const scope = searchScope(req);
  const items = q.trim() ? await dynamicSearch({ query: q, scope, userId: currentUserId(req) }) : [];
  return NextResponse.json({ items, scope }, { headers: { "Cache-Control": "no-store" } });
}
