/* /api/help/tour — fire-and-forget onboarding-tour funnel counter. */
import { NextRequest, NextResponse } from "next/server";
import { tourEvent } from "@/lib/help/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { kind } = await req.json();
    if (kind === "started" || kind === "completed" || kind === "skipped") await tourEvent(kind);
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true });
}
