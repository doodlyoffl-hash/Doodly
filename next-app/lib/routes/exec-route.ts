/* =============================================================
   DOODLY — Per-executive route optimisation (persistence layer).
   Wraps the pure optimize-engine: for one executive on one IST day, order
   their stops into the most-efficient round trip from the warehouse, freeze
   any already-completed stops, and persist per-stop leg metrics on Delivery
   + planned round-trip totals on TripHistory. Hash-cached so an unchanged
   re-run is a no-op. Never throws.
   ============================================================= */
import "server-only";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { DeliveryStatus } from "@prisma/client";
import { getWarehouse } from "@/lib/warehouse/config";
import { optimizeStops, type RouteStopIn } from "@/lib/routes/optimize-engine";
import { istDayWindow } from "@/lib/delivery/stats";
import { log } from "@/lib/logger";

const IST_MS = 5.5 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const istDateIso = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

type AddrRow = { lat: number | null; lng: number | null } | null | undefined;
type DelRow = {
  id: string; status: DeliveryStatus; sequence: number | null; cumulativeKm: number | null; etaMinutes: number | null;
  address: AddrRow; subscription: { address: AddrRow } | null; order: { address: AddrRow } | null;
};
const DELIVERY_ADDR = {
  address: { select: { lat: true, lng: true } },
  subscription: { select: { address: { select: { lat: true, lng: true } } } },
  order: { select: { address: { select: { lat: true, lng: true } } } },
} as const;
const coordOf = (d: DelRow) => { const a = d.address ?? d.subscription?.address ?? d.order?.address ?? null; return { lat: a?.lat ?? null, lng: a?.lng ?? null }; };

/** Optimise (or re-optimise) an executive's route for a day. Completed stops are
    frozen; only the remaining stops are re-sequenced, continuing from the last
    completed stop (else the warehouse). Idempotent via a plan hash. */
export async function optimizeExecutiveRoute(driverId: string, dateIso?: string | null, opts?: { force?: boolean }): Promise<{ stops: number; plannedKm: number; source: string; skipped?: boolean } | null> {
  try {
    const { start, end, iso } = istDayWindow(dateIso);
    const rows = (await db.delivery.findMany({
      where: { driverId, date: { gte: start, lt: end }, status: { notIn: ["FAILED", "SKIPPED"] } },
      orderBy: [{ sequence: "asc" }, { date: "asc" }],
      select: { id: true, status: true, sequence: true, cumulativeKm: true, etaMinutes: true, ...DELIVERY_ADDR },
    })) as DelRow[];
    if (!rows.length) return null;

    const wh = await getWarehouse();
    const completed = rows.filter((r) => r.status === "DELIVERED").sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const remaining = rows.filter((r) => r.status !== "DELIVERED");

    // Origin for the remaining stops = where the executive physically is now:
    // the last completed stop, else the warehouse.
    const lastDone = completed[completed.length - 1];
    const lastCoord = lastDone ? coordOf(lastDone) : null;
    const origin = lastCoord && lastCoord.lat != null && lastCoord.lng != null ? { lat: lastCoord.lat, lng: lastCoord.lng } : { lat: wh.lat, lng: wh.lng };

    const stopsIn: RouteStopIn[] = remaining.map((r) => ({ id: r.id, ...coordOf(r) }));
    // plan hash: warehouse + origin + the (order-insensitive) remaining set → skip a no-op recompute
    const hashSrc = `${wh.lat},${wh.lng}|${origin.lat},${origin.lng}|` + [...stopsIn].sort((a, b) => a.id.localeCompare(b.id)).map((s) => `${s.id}:${s.lat},${s.lng}`).join("|");
    const planHash = createHash("sha1").update(hashSrc).digest("hex");
    if (!opts?.force) {
      const trip = await db.tripHistory.findFirst({ where: { driverId, date: { gte: start, lt: end } }, select: { routePlanHash: true } });
      if (trip?.routePlanHash && trip.routePlanHash === planHash) return { stops: rows.length, plannedKm: 0, source: "cache", skipped: true };
    }

    const res = await optimizeStops(origin, stopsIn);

    let seq = completed.length;                    // remaining continue after completed
    let cum = lastDone?.cumulativeKm ?? 0, eta = lastDone?.etaMinutes ?? 0;
    const updates: Promise<unknown>[] = [];
    res.order.forEach((id, i) => {
      seq++; const leg = res.legs[i];
      cum = round2(cum + leg.km); eta += leg.min;
      updates.push(db.delivery.update({ where: { id }, data: { sequence: seq, legDistanceKm: leg.km, legTravelMin: leg.min, cumulativeKm: cum, etaMinutes: eta, routeSource: res.source } }));
    });
    completed.forEach((r, i) => { if (r.sequence !== i + 1) updates.push(db.delivery.update({ where: { id: r.id }, data: { sequence: i + 1 } })); });
    await Promise.all(updates);

    // planned round-trip total = final stop cumulative + the return-to-warehouse leg
    const plannedKm = round2(cum + res.returnLeg.km);
    const plannedMin = eta + res.returnLeg.min;
    await db.tripHistory.updateMany({ where: { driverId, date: { gte: start, lt: end } }, data: { plannedDistanceKm: plannedKm, plannedDurationMin: plannedMin, routeSource: res.source, routePlanHash: planHash } }).catch(() => {});

    log.info("route.optimise", `driver ${driverId} ${iso}: ${rows.length} stops · ${plannedKm} km · ${res.source}`);
    return { stops: rows.length, plannedKm, source: res.source };
  } catch (e) {
    log.error("route.optimise", `failed for driver ${driverId}: ${(e as Error).message}`);
    return null;
  }
}

/** Re-optimise the route a delivery belongs to (used after a disruption). Pass the
    driverId explicitly when the delivery has just been detached (driverId nulled). */
export async function reoptimizeDriverDay(driverId: string | null | undefined, date: Date | string | null): Promise<void> {
  if (!driverId) return;
  const iso = typeof date === "string" ? date : date ? istDateIso(date) : null;
  await optimizeExecutiveRoute(driverId, iso, { force: true });
}
