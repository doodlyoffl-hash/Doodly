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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ON_TRIP = ["ASSIGNED", "ACCEPTED", "OUT_FOR_DELIVERY"] as const;

async function driverOf(userId: string) {
  const d = await db.driver.findUnique({ where: { userId }, select: { id: true, active: true, execStatus: { select: { availability: true } } } });
  if (!d) throw Errors.forbidden("No delivery profile is linked to this account.");
  return d;
}

export const GET = route("driver.availability.get", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const d = await driverOf(userId);
  const availability = d.execStatus?.availability ?? "OFFLINE";
  return ok({ availability, available: availability === "AVAILABLE" || availability === "RETURNED_TO_DAIRY", onTrip: (ON_TRIP as readonly string[]).includes(availability) });
});

const Body = z.object({ available: z.boolean() });

export const POST = route("driver.availability.set", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const { available } = await parseBody(req, Body);
  const d = await driverOf(userId);
  const current = d.execStatus?.availability ?? "OFFLINE";

  if ((ON_TRIP as readonly string[]).includes(current)) {
    throw Errors.conflict("You have an active trip — complete your deliveries (or mark returned to dairy) before changing availability.");
  }
  const next = available ? "AVAILABLE" : "OFFLINE";
  await db.executiveStatus.upsert({
    where: { driverId: d.id },
    create: { driverId: d.id, availability: next },
    update: { availability: next, ...(available ? {} : { currentTripId: null, assignedBottles: 0 }) },
  });
  // shift change in the assignment audit trail (actorId = the driver's own real User row)
  await db.assignmentLog.create({
    data: { action: "STATUS_CHANGE", driverId: d.id, actorId: userId, actorRole: "delivery_executive", note: `shift ${available ? "started → AVAILABLE" : "ended → OFFLINE"}` },
  }).catch(() => {});
  return ok({ availability: next, available });
});
