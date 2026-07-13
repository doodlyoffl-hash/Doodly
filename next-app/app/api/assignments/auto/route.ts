/* POST /api/assignments/auto — run auto-assignment.
   Body: { date: ISO|YYYY-MM-DD, slot?: string }.
   - slot present → assign that single slot for the date.
   - slot omitted → sweep every slot the date's unassigned deliveries use (the
     robust "assign this whole day" action used by the admin board).
   Ops/Admin only. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAutoAssignment, runScheduledAutoAssignment } from "@/lib/assignment/service";
import { actorFrom, canManageDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ date: z.string().min(1), slot: z.string().min(1).optional() });

export async function POST(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canManageDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  // Accept a full ISO or a plain "YYYY-MM-DD"; the sweep only needs the IST day.
  const dayStr = parsed.data.date.slice(0, 10);
  try {
    const result = parsed.data.slot
      ? await runAutoAssignment({ date: parsed.data.date, slot: parsed.data.slot, actorId: actor.actorId, actorRole: actor.actorRole })
      : await runScheduledAutoAssignment({ actorId: actor.actorId, actorRole: actor.actorRole }, dayStr);
    return NextResponse.json(result);
  } catch (e) {
    console.error("assignments.auto", (e as Error)?.message);
    return NextResponse.json({ error: "Auto-assignment failed. Please retry." }, { status: 500 });
  }
}
