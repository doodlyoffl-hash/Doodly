/* /api/search/trending — active trending searches for the palette empty state. */
import { NextResponse } from "next/server";
import { getTrending } from "@/lib/search/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ trending: await getTrending() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
