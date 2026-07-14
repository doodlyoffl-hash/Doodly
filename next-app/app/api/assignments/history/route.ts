/* GET /api/assignments/history?deliveryId=... — the complete assignment history for
   one order (every AUTO_ASSIGN / MANUAL_ASSIGN / REASSIGN / UNASSIGN / accept etc.,
   resolved to executive names + actor + time). Ops/Admin (deliveries:view). */
import { NextRequest, NextResponse } from "next/server";
import { assignmentHistory } from "@/lib/assignment/service";
import { actorFrom, canViewDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canViewDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const deliveryId = req.nextUrl.searchParams.get("deliveryId");
  if (!deliveryId) return NextResponse.json({ error: "deliveryId is required." }, { status: 400 });
  try {
    const history = await assignmentHistory(deliveryId);
    return NextResponse.json({ deliveryId, history }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("assignments.history", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load history." }, { status: 500 });
  }
}
