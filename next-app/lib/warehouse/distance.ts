/* =============================================================
   DOODLY — Warehouse → customer distance engine
   Computes road distance + travel time from the configured warehouse
   origin to each delivery address and persists it on Delivery. Uses the
   Google Distance Matrix API when a server key is present, else a clearly
   labelled haversine (straight-line) fallback. Never throws. This is the
   data foundation for Delivery Management, Auto-Assignment, reports and
   future driver compensation — no pay math here.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import type { DeliveryStatus } from "@prisma/client";
import { getWarehouse, type Warehouse } from "@/lib/warehouse/config";
import { log } from "@/lib/logger";

export interface Point { lat: number; lng: number; }
export type DistanceSource = "ROAD" | "HAVERSINE";
export interface DistanceResult { km: number; minutes: number; source: DistanceSource; }

const HAVERSINE_SPEED_KMH = 22; // effective city-driving speed for the fallback ETA
const TERMINAL_STATUSES: DeliveryStatus[] = ["DELIVERED", "FAILED", "SKIPPED"]; // don't recompute past stops
const FUTURE_STATUS = { notIn: TERMINAL_STATUSES };

/** Great-circle distance (km). */
export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const gkey = () => { const v = process.env.GOOGLE_MAPS_API_KEY; return v && v.trim() ? v.trim() : undefined; };

/** Google Distance Matrix (driving). Null on no-key / any failure → caller falls back. */
async function roadDistance(origin: Point, dest: Point): Promise<DistanceResult | null> {
  const key = gkey(); if (!key) return null;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}&mode=driving&region=in&key=${key}`;
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { rows?: { elements?: { status?: string; distance?: { value: number }; duration?: { value: number } }[] }[] } | null;
    const el = j?.rows?.[0]?.elements?.[0];
    if (el && el.status === "OK" && el.distance && el.duration) {
      return { km: Math.round((el.distance.value / 1000) * 100) / 100, minutes: Math.max(1, Math.round(el.duration.value / 60)), source: "ROAD" };
    }
    return null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Is a coordinate plausibly serviceable (within the warehouse radius)? Catches
    mis-geocodes that land a "serviceable" pincode 100+ km away. */
export async function isWithinServiceRadius(point: Point, wh?: Warehouse): Promise<boolean> {
  const w = wh ?? (await getWarehouse());
  return haversineKm({ lat: w.lat, lng: w.lng }, point) <= w.maxDeliveryRadiusKm;
}

/** Distance + ETA between two points: road (Google) when available, else labelled haversine. */
export async function computeDistance(origin: Point, dest: Point): Promise<DistanceResult> {
  const road = await roadDistance(origin, dest);
  if (road) return road;
  const km = Math.round(haversineKm(origin, dest) * 100) / 100;
  return { km, minutes: Math.max(1, Math.round((km / HAVERSINE_SPEED_KMH) * 60)), source: "HAVERSINE" };
}

const deliveryAddr = (d: { address?: { lat: number | null; lng: number | null } | null; subscription?: { address?: { lat: number | null; lng: number | null } | null } | null; order?: { address?: { lat: number | null; lng: number | null } | null } | null }) =>
  d.address ?? d.subscription?.address ?? d.order?.address ?? null;

const DELIVERY_ADDR_SELECT = {
  address: { select: { lat: true, lng: true } },
  subscription: { select: { address: { select: { lat: true, lng: true } } } },
  order: { select: { address: { select: { lat: true, lng: true } } } },
} as const;

/** Compute + persist distance/time for one delivery from the configured warehouse. Never throws. */
export async function recomputeDeliveryDistance(deliveryId: string, wh?: Warehouse): Promise<void> {
  try {
    const d = await db.delivery.findUnique({ where: { id: deliveryId }, select: DELIVERY_ADDR_SELECT });
    if (!d) return;
    const warehouse = wh ?? (await getWarehouse());
    const addr = deliveryAddr(d);
    if (!addr || addr.lat == null || addr.lng == null) {
      await db.delivery.update({ where: { id: deliveryId }, data: { distanceKm: null, travelTimeMin: null, distanceSource: null, routeStatus: "NO_COORDS", distanceCalcAt: new Date(), distanceMeta: { warehouse: { lat: warehouse.lat, lng: warehouse.lng } } } });
      return;
    }
    const r = await computeDistance({ lat: warehouse.lat, lng: warehouse.lng }, { lat: addr.lat, lng: addr.lng });
    const routeStatus = r.km > warehouse.maxDeliveryRadiusKm ? "FAR" : "OK";
    await db.delivery.update({ where: { id: deliveryId }, data: { distanceKm: r.km, travelTimeMin: r.minutes, distanceSource: r.source, routeStatus, distanceCalcAt: new Date(), distanceMeta: { warehouse: { name: warehouse.name, lat: warehouse.lat, lng: warehouse.lng }, provider: r.source } } });
  } catch (e) {
    log.error("warehouse.distance", `recompute failed for ${deliveryId}: ${(e as Error).message}`);
  }
}

/** Compute distance ONCE for a subscription's address and stamp all its freshly-created
    (not-yet-computed) deliveries — they all share the same address, so one API call suffices. */
export async function computeSubscriptionDeliveries(subscriptionId: string): Promise<number> {
  const where = { subscriptionId, distanceCalcAt: null, status: FUTURE_STATUS };
  if ((await db.delivery.count({ where })) === 0) return 0;   // nothing new → skip the API call
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { address: { select: { lat: true, lng: true } } } });
  const wh = await getWarehouse();
  const addr = sub?.address;
  if (!addr || addr.lat == null || addr.lng == null) {
    const r = await db.delivery.updateMany({ where, data: { routeStatus: "NO_COORDS", distanceCalcAt: new Date(), distanceKm: null, travelTimeMin: null, distanceSource: null, distanceMeta: { warehouse: { lat: wh.lat, lng: wh.lng } } } });
    return r.count;
  }
  const d = await computeDistance({ lat: wh.lat, lng: wh.lng }, { lat: addr.lat, lng: addr.lng });
  const routeStatus = d.km > wh.maxDeliveryRadiusKm ? "FAR" : "OK";
  const r = await db.delivery.updateMany({ where, data: { distanceKm: d.km, travelTimeMin: d.minutes, distanceSource: d.source, routeStatus, distanceCalcAt: new Date(), distanceMeta: { warehouse: { name: wh.name, lat: wh.lat, lng: wh.lng }, provider: d.source } } });
  return r.count;
}

/** Recompute every FUTURE delivery for an address (address change). Past snapshots untouched. */
export async function recomputeDeliveriesForAddress(addressId: string): Promise<number> {
  const rows = await db.delivery.findMany({ where: { addressId, status: FUTURE_STATUS }, select: { id: true } });
  const wh = await getWarehouse();
  for (const r of rows) await recomputeDeliveryDistance(r.id, wh);
  return rows.length;
}

/** Recompute every FUTURE delivery (warehouse origin changed). */
export async function recomputeAllFutureDeliveries(limit = 5000): Promise<{ computed: number }> {
  const rows = await db.delivery.findMany({ where: { status: FUTURE_STATUS }, select: { id: true }, take: limit });
  const wh = await getWarehouse();
  for (const r of rows) await recomputeDeliveryDistance(r.id, wh);
  return { computed: rows.length };
}

/** Cron backfill: fill any delivery that has never had a distance computed. */
export async function backfillDeliveryDistances(limit = 500): Promise<{ computed: number }> {
  const rows = await db.delivery.findMany({ where: { distanceCalcAt: null }, select: { id: true }, take: limit, orderBy: { date: "desc" } });
  const wh = await getWarehouse();
  for (const r of rows) await recomputeDeliveryDistance(r.id, wh);
  return { computed: rows.length };
}
