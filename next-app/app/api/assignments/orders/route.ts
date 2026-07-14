/* GET /api/assignments/orders?date=YYYY-MM-DD — order-centric assignment visibility
   for the admin Auto Assignment board: every order for the IST day with its assigned
   executive, method (Auto/Manual/Reassigned), status and the per-day summary.
   Ops/Admin (deliveries:view). */
import { NextRequest, NextResponse } from "next/server";
import { listAssignmentOrders } from "@/lib/assignment/service";
import { actorFrom, canViewDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canViewDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const date = req.nextUrl.searchParams.get("date");
  try {
    const data = await listAssignmentOrders(date);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("assignments.orders", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load assignments." }, { status: 500 });
  }
}
