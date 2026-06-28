/* POST /api/assignments/override — admin manual overrides.
   Body (discriminated by `action`):
     { action: "manual",   deliveryId, driverId }
     { action: "reassign", deliveryId, toDriverId, force? }
     { action: "unassign", deliveryId }
     { action: "lock",     deliveryId, locked }
   Ops/Admin only. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { manualAssign, reassignDelivery, unassignDelivery, setAssignmentLock } from "@/lib/assignment/service";
import { actorFrom, canManageDeliveries } from "@/lib/assignment/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("manual"), deliveryId: z.string().min(1), driverId: z.string().min(1) }),
  z.object({ action: z.literal("reassign"), deliveryId: z.string().min(1), toDriverId: z.string().min(1), force: z.boolean().optional() }),
  z.object({ action: z.literal("unassign"), deliveryId: z.string().min(1) }),
  z.object({ action: z.literal("lock"), deliveryId: z.string().min(1), locked: z.boolean() }),
]);

export async function POST(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canManageDeliveries(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const a = { actorId: actor.actorId, actorRole: actor.actorRole };
  try {
    const d = parsed.data;
    const result =
      d.action === "manual" ? await manualAssign({ deliveryId: d.deliveryId, driverId: d.driverId, ...a })
      : d.action === "reassign" ? await reassignDelivery({ deliveryId: d.deliveryId, toDriverId: d.toDriverId, force: d.force, ...a })
      : d.action === "unassign" ? await unassignDelivery({ deliveryId: d.deliveryId, ...a })
      : await setAssignmentLock({ deliveryId: d.deliveryId, locked: d.locked, ...a });
    return NextResponse.json(result);
  } catch (e) {
    // Capacity/lock violations surface as a 409 with the reason.
    return NextResponse.json({ error: (e as Error)?.message ?? "Override failed" }, { status: 409 });
  }
}
