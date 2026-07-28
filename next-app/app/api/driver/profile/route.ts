/* /api/driver/profile — the signed-in delivery executive's OWN profile.
   GET   — real identity + operational stats (name, employee id, zone, vehicle,
           rating, joined, lifetime + today's deliveries, shift status, capacity).
   PATCH — { emergencyContact } — the one field the executive may self-edit.
           Identity fields (phone/email/employee id/zone/vehicle) are admin-managed
           and returned read-only. Emergency contact is stored per-driver in
           AppSetting so no schema change is needed. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { istDayWindow } from "@/lib/delivery/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ON_TRIP = ["ASSIGNED", "ACCEPTED", "OUT_FOR_DELIVERY"];
const emergencyKey = (driverId: string) => `driver.emergency.${driverId}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function joinedLabel(d: Date | null | undefined): string {
  if (!d) return "—";
  const ist = new Date(d.getTime() + 5.5 * 3600e3);   // IST month/year, no locale surprises
  return `${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

export const GET = route("driver.profile.get", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const driver = await db.driver.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, email: true, phone: true, createdAt: true } },
      capacity: { select: { maxBottles: true } },
      execStatus: { select: { availability: true, assignedBottles: true } },
    },
  });
  if (!driver) throw Errors.forbidden("No delivery profile is linked to this account.");

  const { start, end } = istDayWindow();
  const [zone, totalDeliveries, today, emergencyRow] = await Promise.all([
    driver.zoneId ? db.deliveryZone.findUnique({ where: { id: driver.zoneId }, select: { name: true } }) : Promise.resolve(null),
    db.delivery.count({ where: { driverId: driver.id, status: "DELIVERED" } }),
    db.delivery.findMany({ where: { driverId: driver.id, date: { gte: start, lt: end } }, select: { status: true } }),
    db.appSetting.findUnique({ where: { key: emergencyKey(driver.id) } }),
  ]);

  const availability = String(driver.execStatus?.availability ?? "OFFLINE");
  const emergency = emergencyRow && emergencyRow.value != null ? String(emergencyRow.value) : "";

  return ok({
    profile: {
      name: driver.user.name || (driver.user.email ? String(driver.user.email).split("@")[0] : "Executive"),
      email: driver.user.email || null,
      phone: driver.user.phone || null,
      emergencyContact: emergency || null,
      employeeId: driver.employeeId || null,
      driverId: driver.id,
      zone: zone?.name || null,
      vehicleNo: driver.vehicleNo || null,
      rating: driver.rating,
      active: driver.active,
      joinedAt: driver.user.createdAt ? driver.user.createdAt.toISOString() : null,
      joinedLabel: joinedLabel(driver.user.createdAt),
      availability,
      available: availability === "AVAILABLE" || availability === "RETURNED_TO_DAIRY",
      onTrip: ON_TRIP.includes(availability),
      capacityBottles: driver.capacity?.maxBottles ?? 45,
      assignedBottles: driver.execStatus?.assignedBottles ?? 0,
      totalDeliveries,
      deliveredToday: today.filter((d) => d.status === "DELIVERED").length,
      stopsToday: today.length,
    },
  });
});

export const PATCH = route("driver.profile.patch", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const driver = await db.driver.findUnique({ where: { userId }, select: { id: true } });
  if (!driver) throw Errors.forbidden("No delivery profile is linked to this account.");

  const body = (await req.json().catch(() => null)) as { emergencyContact?: unknown } | null;
  if (!body || typeof body !== "object") throw Errors.badRequest("Request body must be valid JSON.");
  if (body.emergencyContact === undefined) throw Errors.badRequest("Nothing to update.");

  const raw = String(body.emergencyContact ?? "").trim();
  if (raw.length > 40) throw Errors.badRequest("That number looks too long — check and try again.");
  // Allow clearing (empty), else require a plausible phone (digits, spaces, +, -, ()).
  if (raw !== "" && (raw.replace(/\D/g, "").length < 10 || !/^[\d+\-()\s]+$/.test(raw))) {
    throw Errors.badRequest("Enter a valid emergency contact number.");
  }

  await db.appSetting.upsert({
    where: { key: emergencyKey(driver.id) },
    create: { key: emergencyKey(driver.id), value: raw, updatedBy: userId },
    update: { value: raw, updatedBy: userId },
  });
  return ok({ updated: ["emergencyContact"], emergencyContact: raw || null });
});
