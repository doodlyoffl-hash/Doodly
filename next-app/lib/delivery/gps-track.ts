/* =============================================================
   DOODLY — GPS track ingestion + actual-distance engine.
   Turns a stream of raw GPS readings into the executive's real travelled km
   during their OPEN shift, applying server-side FRAUD FILTERS so the client can
   never inflate distance:
     • reject a reading worse than maxAccuracyM (noisy)
     • dedupe by clientId (an offline replay never double-counts)
     • per segment (vs the previous stored point): drop the distance when the
       implied speed > maxSpeedKmh (teleport), the gap > maxGapS (signal loss),
       or the move < minMoveM (GPS jitter while parked)
   Distance accumulates on Shift.actualDistanceKm; recompute rebuilds it from the
   stored track (offline-sync reconciliation). Reuses haversineKm.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { haversineKm } from "@/lib/warehouse/distance";
import { getGpsTrackingConfig } from "@/lib/delivery/gps-config";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RawGpsPoint {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speed?: number | null;
  capturedAt: string | Date;
  clientId: string;
}

export interface IngestResult {
  shiftId: string | null;
  accepted: number;              // new points stored this call
  actualDistanceKm: number;      // running shift total after this call
  gpsPointCount: number;
  note?: "disabled" | "no_shift" | "deduped" | "empty";
}

/** Pure per-segment filter: distance counted between two consecutive points, or 0. */
function segmentKm(prev: { lat: number; lng: number; capturedAt: Date }, p: { lat: number; lng: number; capturedAt: Date }, cfg: { minMoveM: number; maxSpeedKmh: number; maxGapS: number }): number {
  const dt = (p.capturedAt.getTime() - prev.capturedAt.getTime()) / 1000;   // seconds
  if (!(dt > 0)) return 0;
  const km = haversineKm(prev, p);
  const speedKmh = km / (dt / 3600);
  if (dt > cfg.maxGapS) return 0;                 // signal loss — don't count the jump
  if (km * 1000 < cfg.minMoveM) return 0;         // jitter / stationary
  if (speedKmh > cfg.maxSpeedKmh) return 0;       // teleport / GPS spike / fraud
  return km;
}

/** Ingest a batch of GPS readings for the driver's OPEN shift. Idempotent (clientId). */
export async function ingestGpsPoints(driverId: string, points: RawGpsPoint[]): Promise<IngestResult> {
  const cfg = await getGpsTrackingConfig();
  if (!cfg.enabled) return { shiftId: null, accepted: 0, actualDistanceKm: 0, gpsPointCount: 0, note: "disabled" };
  const shift = await db.shift.findFirst({ where: { driverId, status: "OPEN" }, orderBy: { startedAt: "desc" }, select: { id: true } });
  if (!shift) return { shiftId: null, accepted: 0, actualDistanceKm: 0, gpsPointCount: 0, note: "no_shift" };

  const clean = (points || [])
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), accuracyM: p.accuracyM == null ? null : Number(p.accuracyM), speed: p.speed == null ? null : Number(p.speed), capturedAt: new Date(p.capturedAt), clientId: String(p.clientId || "") }))
    .filter((p) => p.clientId && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !isNaN(p.capturedAt.getTime()))
    .filter((p) => p.accuracyM == null || p.accuracyM <= cfg.maxAccuracyM)      // drop noisy fixes
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const cur = async () => (await db.shift.findUnique({ where: { id: shift.id }, select: { actualDistanceKm: true, gpsPointCount: true } }))!;
  if (!clean.length) { const s = await cur(); return { shiftId: shift.id, accepted: 0, actualDistanceKm: round2(s.actualDistanceKm), gpsPointCount: s.gpsPointCount, note: "empty" }; }

  const existing = new Set((await db.shiftGpsPoint.findMany({ where: { clientId: { in: clean.map((p) => p.clientId) } }, select: { clientId: true } })).map((r) => r.clientId));
  const fresh = clean.filter((p) => !existing.has(p.clientId));
  if (!fresh.length) { const s = await cur(); return { shiftId: shift.id, accepted: 0, actualDistanceKm: round2(s.actualDistanceKm), gpsPointCount: s.gpsPointCount, note: "deduped" }; }

  const last = await db.shiftGpsPoint.findFirst({ where: { shiftId: shift.id }, orderBy: { capturedAt: "desc" }, select: { lat: true, lng: true, capturedAt: true } });
  let prev = last ? { lat: last.lat, lng: last.lng, capturedAt: last.capturedAt } : null;
  let added = 0;
  const rows = fresh.map((p) => {
    if (prev) added += segmentKm(prev, p, cfg);
    prev = { lat: p.lat, lng: p.lng, capturedAt: p.capturedAt };
    return { shiftId: shift.id, driverId, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, speed: p.speed, capturedAt: p.capturedAt, clientId: p.clientId };
  });

  await db.shiftGpsPoint.createMany({ data: rows, skipDuplicates: true });
  const updated = await db.shift.update({
    where: { id: shift.id },
    data: { actualDistanceKm: { increment: round2(added) }, gpsPointCount: { increment: rows.length } },
    select: { actualDistanceKm: true, gpsPointCount: true },
  });
  // keep the live-tracking surfaces fresh (admin route view + customer tracking map)
  const latest = fresh[fresh.length - 1];
  await db.driver.update({ where: { id: driverId }, data: { lat: latest.lat, lng: latest.lng, lastSeenAt: new Date() } }).catch(() => {});

  return { shiftId: shift.id, accepted: rows.length, actualDistanceKm: round2(updated.actualDistanceKm), gpsPointCount: updated.gpsPointCount };
}

/** Rebuild actualDistanceKm from the whole stored track (offline-sync reconciliation / close). */
export async function recomputeShiftDistance(shiftId: string): Promise<number> {
  const cfg = await getGpsTrackingConfig();
  const pts = await db.shiftGpsPoint.findMany({ where: { shiftId }, orderBy: { capturedAt: "asc" }, select: { lat: true, lng: true, capturedAt: true } });
  let total = 0;
  let prev: { lat: number; lng: number; capturedAt: Date } | null = null;
  for (const p of pts) { if (prev) total += segmentKm(prev, p, cfg); prev = p; }
  const km = round2(total);
  await db.shift.update({ where: { id: shiftId }, data: { actualDistanceKm: km, gpsPointCount: pts.length } });
  return km;
}
