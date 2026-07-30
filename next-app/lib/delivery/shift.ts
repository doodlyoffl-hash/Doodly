/* =============================================================
   DOODLY — Delivery-executive work SHIFT log.
   ExecutiveStatus.availability is the LIVE state (AVAILABLE / OFFLINE …).
   A `Shift` row is the durable record: opened on Start Shift, closed on End
   Shift, stamped with hours worked + the shift's delivery/distance/bottle
   totals (derived from the deliveries completed inside the shift window).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface ShiftTotals {
  deliveriesCount: number;
  distanceKm: number;
  bottlesDelivered: number;
  bottlesCollected: number;
}

/** Totals from the deliveries this driver completed within [from, to]. */
export async function shiftTotals(driverId: string, from: Date, to: Date): Promise<ShiftTotals> {
  const rows = await db.delivery.findMany({
    where: { driverId, deliveredAt: { gte: from, lte: to }, status: { in: ["DELIVERED", "PARTIALLY_DELIVERED"] } },
    select: { legDistanceKm: true, bottlesOut: true, bottlesIn: true },
  });
  return {
    deliveriesCount: rows.length,
    distanceKm: Math.round(rows.reduce((a, r) => a + (r.legDistanceKm ?? 0), 0) * 100) / 100,
    bottlesDelivered: rows.reduce((a, r) => a + (r.bottlesOut ?? 0), 0),
    bottlesCollected: rows.reduce((a, r) => a + (r.bottlesIn ?? 0), 0),
  };
}

/** The driver's currently-open shift, if any. */
export function currentShift(driverId: string) {
  return db.shift.findFirst({ where: { driverId, status: "OPEN" }, orderBy: { startedAt: "desc" } });
}

/** The driver's most recently CLOSED shift (for a "last shift summary" card). */
export function lastClosedShift(driverId: string) {
  return db.shift.findFirst({ where: { driverId, status: "CLOSED" }, orderBy: { endedAt: "desc" } });
}

/** Open a shift when the exec starts. Idempotent — reuse an already-open one. */
export async function openShift(driverId: string) {
  const existing = await currentShift(driverId);
  if (existing) return existing;
  return db.shift.create({ data: { driverId, status: "OPEN" } });
}

/** Close the open shift and stamp its worked-minutes + totals. null if none open. */
export async function closeShift(driverId: string) {
  const open = await currentShift(driverId);
  if (!open) return null;
  const endedAt = new Date();
  const totals = await shiftTotals(driverId, open.startedAt, endedAt);
  const workedMinutes = Math.max(0, Math.round((endedAt.getTime() - open.startedAt.getTime()) / 60000));
  return db.shift.update({
    where: { id: open.id },
    data: { status: "CLOSED", endedAt, workedMinutes, ...totals },
  });
}
