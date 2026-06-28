/* POST /api/assignments/auto — run auto-assignment for a delivery slot.
   Body: { date: ISO string, slot: string }. Ops/Admin only. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAutoAssignment } from "@/lib/assignment/service";
import { actorFrom, canManageDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ date: z.string().min(1), slot: z.string().min(1) });

export async function POST(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canManageDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  try {
    const result = await runAutoAssignment({ ...parsed.data, actorId: actor.actorId, actorRole: actor.actorRole });
    return NextResponse.json(result);
  } catch (e) {
    console.error("assignments.auto", (e as Error)?.message);
    return NextResponse.json({ error: "Auto-assignment failed. Please retry." }, { status: 500 });
  }
}
