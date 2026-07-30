/* /api/driver/availability — the delivery executive's OWN shift toggle.
   GET  — current availability (the driver reads their own status).
   POST — { available: boolean }  Start Shift → AVAILABLE · End Shift → OFFLINE.
   Guard: an executive who is mid-trip (ASSIGNED / ACCEPTED / OUT_FOR_DELIVERY)
   must finish or return to dairy before going offline — 409 otherwise. Only
   AVAILABLE executives receive new auto-assignments (engine filter). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { openShift, closeShift, currentShift } from "@/lib/delivery/shift";
import { getGpsTrackingConfig } from "@/lib/delivery/gps-config";
import type { DeliveryStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ON_TRIP = ["ASSIGNED", "ACCEPTED", "OUT_FOR_DELIVERY"] as const;
// Deliveries that represent real, unfinished work in the exec's hands.
const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];

async function driverOf(userId: string) {
  const d = await db.driver.findUnique({ where: { userId }, select: { id: true, active: true, execStatus: { select: { availability: true } } } });
  if (!d) throw Errors.forbidden("No delivery profile is linked to this account.");
  return d;
}

export const GET = route("driver.availability.get", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const d = await driverOf(userId);
  const availability = d.execStatus?.availability ?? "OFFLINE";
  const [shift, gps] = await Promise.all([currentShift(d.id).catch(() => null), getGpsTrackingConfig().catch(() => null)]);
  // gpsConfig tells the exec app how to sample GPS (cadence + client-side filters) during a shift.
  const gpsConfig = gps ? { enabled: gps.enabled, sampleIntervalS: gps.sampleIntervalS, minMoveM: gps.minMoveM, maxAccuracyM: gps.maxAccuracyM } : null;
  return ok({ availability, available: availability === "AVAILABLE" || availability === "RETURNED_TO_DAIRY", onTrip: (ON_TRIP as readonly string[]).includes(availability), shift, gpsConfig });
});

const Body = z.object({ available: z.boolean(), lat: z.number().gte(-90).lte(90).optional(), lng: z.number().gte(-180).lte(180).optional() });

export const POST = route("driver.availability.set", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const { available, lat, lng } = await parseBody(req, Body);
  const loc = lat != null && lng != null ? { lat, lng } : undefined;   // GPS distance tracking: stamp the shift start/end position
  const d = await driverOf(userId);
  const current = d.execStatus?.availability ?? "OFFLINE";

  // Only block a mid-trip exec when they GENUINELY have active deliveries. A stale on-trip
  // status (a trip that ended without the status being reset) must never trap them off-shift —
  // so we verify against real deliveries, not just the status flag. No active work → clear it.
  let staleTrip = false;
  if ((ON_TRIP as readonly string[]).includes(current)) {
    const activeCount = await db.delivery.count({ where: { driverId: d.id, status: { in: ACTIVE_DELIVERY_STATUSES } } });
    if (activeCount > 0) throw Errors.conflict("You have an active trip — complete your deliveries (or mark returned to dairy) before changing availability.");
    staleTrip = true;
  }
  const next = available ? "AVAILABLE" : "OFFLINE";
  await db.executiveStatus.upsert({
    where: { driverId: d.id },
    create: { driverId: d.id, availability: next },
    update: { availability: next, ...(available && !staleTrip ? {} : { currentTripId: null, assignedBottles: 0 }) },
  });
  // shift change in the assignment audit trail (actorId = the driver's own real User row)
  await db.assignmentLog.create({
    data: { action: "STATUS_CHANGE", driverId: d.id, actorId: userId, actorRole: "delivery_executive", note: `shift ${available ? "started → AVAILABLE" : "ended → OFFLINE"}` },
  }).catch(() => {});
  // Shift log: open a Shift on Start, close it (stamping worked-minutes + totals) on End.
  let shift = null;
  try { shift = available ? await openShift(d.id, loc) : await closeShift(d.id, loc); } catch (e) { console.error("shift.toggle", (e as Error)?.message); }
  // Central audit trail (in addition to the AssignmentLog STATUS_CHANGE) so shift start/end
  // appears in the admin Audit Logs view alongside every other executive action.
  try { const { audit } = await import("@/lib/auth/audit"); const { reqContext } = await import("@/lib/auth/request"); await audit({ userId, actorRole: "delivery_executive", action: available ? "shift.started" : "shift.ended", target: shift?.id ?? d.id, ctx: reqContext(req) }); } catch { /* non-blocking */ }

  // Automatic assignment trigger: an executive starting their shift → sweep today's
  // waiting deliveries onto the now-available executives (idempotent, MANUAL-aware).
  let assignment: unknown = undefined;
  if (available) {
    try { const { runScheduledAutoAssignment } = await import("@/lib/assignment/service"); assignment = await runScheduledAutoAssignment({ actorRole: "system" }); } catch (e) { console.error("assign.onShiftStart", (e as Error)?.message); }
  }
  return ok({ availability: next, available, shift, assignment });
});
