/* POST /api/assignments/return — an executive returned to the dairy; pull the
   next batch from the pending queue. Body: { driverId }. Ops/Admin only.
   (Executives themselves trigger this via the delivery app in production.) */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { onExecutiveReturned } from "@/lib/assignment/service";
import { actorFrom, canManageDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ driverId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canManageDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  try {
    const result = await onExecutiveReturned({ ...parsed.data, actorId: actor.actorId, actorRole: actor.actorRole });
    return NextResponse.json(result);
  } catch (e) {
    console.error("assignments.return", (e as Error)?.message);
    return NextResponse.json({ error: "Could not process the return trip." }, { status: 500 });
  }
}
