/* =============================================================
   DOODLY — GPS distance-tracking policy (Super-Admin).
   One AppSetting row ("gps.tracking.config") so thresholds tune with no
   deploy. Drives the client sampling cadence + the server-side fraud filters
   that keep travelled-km honest. Mirrors lib/geo/correction-config.ts.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface GpsTrackingConfig {
  enabled: boolean;
  sampleIntervalS: number;   // client sampling cadence (seconds) — the exec app polls this fast
  minMoveM: number;          // ignore a segment shorter than this (GPS jitter floor, metres)
  maxAccuracyM: number;      // reject a reading worse than this accuracy (metres)
  maxSpeedKmh: number;       // reject a segment implying a faster speed (teleport / fraud)
  maxGapS: number;           // don't count a segment across a gap longer than this (signal loss)
}

export const GPS_TRACKING_KEY = "gps.tracking.config";

export const GPS_TRACKING_DEFAULTS: GpsTrackingConfig = {
  enabled: true,
  sampleIntervalS: 6,
  minMoveM: 8,
  maxAccuracyM: 100,
  maxSpeedKmh: 120,
  maxGapS: 300,
};

const clamp = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };

function sanitize(c: Partial<GpsTrackingConfig>): GpsTrackingConfig {
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : GPS_TRACKING_DEFAULTS.enabled,
    sampleIntervalS: clamp(c.sampleIntervalS, GPS_TRACKING_DEFAULTS.sampleIntervalS, 2, 120),
    minMoveM: clamp(c.minMoveM, GPS_TRACKING_DEFAULTS.minMoveM, 0, 200),
    maxAccuracyM: clamp(c.maxAccuracyM, GPS_TRACKING_DEFAULTS.maxAccuracyM, 10, 1000),
    maxSpeedKmh: clamp(c.maxSpeedKmh, GPS_TRACKING_DEFAULTS.maxSpeedKmh, 20, 400),
    maxGapS: clamp(c.maxGapS, GPS_TRACKING_DEFAULTS.maxGapS, 30, 3600),
  };
}

export async function getGpsTrackingConfig(): Promise<GpsTrackingConfig> {
  const row = await db.appSetting.findUnique({ where: { key: GPS_TRACKING_KEY } }).catch(() => null);
  return sanitize({ ...GPS_TRACKING_DEFAULTS, ...((row?.value as Partial<GpsTrackingConfig>) ?? {}) });
}

export async function patchGpsTrackingConfig(patch: Partial<GpsTrackingConfig>, updatedBy?: string | null): Promise<GpsTrackingConfig> {
  const next = sanitize({ ...(await getGpsTrackingConfig()), ...patch });
  await db.appSetting.upsert({
    where: { key: GPS_TRACKING_KEY },
    create: { key: GPS_TRACKING_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}
