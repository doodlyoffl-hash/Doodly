/* /api/assignments/strategy — the auto-assignment distribution mode.
   GET  — current strategy (deliveries:view).
   POST — { strategy: "EQUAL"|"CAPACITY"|"AREA"|"MANUAL" } (deliveries manage, audited).
   EQUAL = Startup Mode (default): equal order counts across available executives. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAssignmentStrategy, setAssignmentStrategy, ASSIGNMENT_STRATEGIES } from "@/lib/assignment/strategy";
import { actorFrom, canManageDeliveries, canViewDeliveries } from "@/lib/assignment/guard";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canViewDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ strategy: await getAssignmentStrategy(), options: ASSIGNMENT_STRATEGIES }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({ strategy: z.enum(ASSIGNMENT_STRATEGIES) });

export async function POST(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canManageDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const prev = await getAssignmentStrategy();
  const next = await setAssignmentStrategy(parsed.data.strategy, actor.actorRole);
  await audit({ actorRole: actor.actorRole, action: "assignment.strategy.update", target: `${prev} → ${next}` }).catch(() => {});
  return NextResponse.json({ ok: true, strategy: next });
}
