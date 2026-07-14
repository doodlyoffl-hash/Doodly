/* GET /api/assignments/executive/[driverId]?date=YYYY-MM-DD — the click-through
   executive detail panel (name, IDs, availability, today's load, remaining capacity,
   live location placeholder). Ops/Admin (deliveries:view). */
import { NextRequest, NextResponse } from "next/server";
import { executiveDetail } from "@/lib/assignment/service";
import { actorFrom, canViewDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { driverId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const actor = actorFrom(req);
  if (!canViewDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const date = req.nextUrl.searchParams.get("date");
  try {
    const data = await executiveDetail(params.driverId, date);
    if (!data) return NextResponse.json({ error: "Executive not found." }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("assignments.executive", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load the executive." }, { status: 500 });
  }
}
