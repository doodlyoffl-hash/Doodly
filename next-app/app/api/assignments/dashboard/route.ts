/* GET /api/assignments/dashboard?date=ISO&slot=... — live assignment aggregates.
   Powers the auto-refresh dashboard. Ops/Admin (deliveries:view) only. */
import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/lib/assignment/service";
import { actorFrom, canViewDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canViewDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const slot = req.nextUrl.searchParams.get("slot") ?? undefined;
  try {
    const data = await getDashboard({ date, slot });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("assignments.dashboard", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load the dashboard." }, { status: 500 });
  }
}
