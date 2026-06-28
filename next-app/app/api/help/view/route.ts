/* /api/help/view — fire-and-forget FAQ view counter (powers "most viewed"). */
import { NextRequest, NextResponse } from "next/server";
import { incrementView } from "@/lib/help/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (id) await incrementView(String(id));
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}
