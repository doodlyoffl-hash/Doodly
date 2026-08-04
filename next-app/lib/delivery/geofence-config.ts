/* =============================================================
   DOODLY — Automatic "Reached Customer" geofence policy (Super-Admin).
   One AppSetting row ("geofence.reached.config") so the arrival rules tune with
   NO deploy. The server watches each executive's live GPS stream during an OPEN
   shift and auto-flips their assigned ON_THE_WAY stop to REACHED once the exec is
   within `radiusM` of the customer's verified pin for at least `minStaySeconds`
   (dwell — defeats a high-speed drive-past). "Delivered" always stays manual.
   Mirrors lib/delivery/gps-config.ts + lib/geo/correction-config.ts.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface GeofenceConfig {
  enabled: boolean;          // master "Auto-Reached" switch — off = execs mark REACHED manually only
  radiusM: number;           // geofence radius around the customer pin (metres) — default 50
  minAccuracyM: number;      // ignore a fix worse than this accuracy for arrival (metres) — anti false-positive
  minStaySeconds: number;    // require the exec to stay inside the geofence this long before auto-reach (0 = immediate)
  requireVerifiedPin: boolean; // only auto-reach against a VERIFIED customer pin (a bad/unverified pin never auto-fires)
}

export const GEOFENCE_KEY = "geofence.reached.config";

export const GEOFENCE_DEFAULTS: GeofenceConfig = {
  enabled: true,
  radiusM: 50,
  minAccuracyM: 50,
  minStaySeconds: 20,
  requireVerifiedPin: true,
};

const clamp = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };

function sanitize(c: Partial<GeofenceConfig>): GeofenceConfig {
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : GEOFENCE_DEFAULTS.enabled,
    radiusM: clamp(c.radiusM, GEOFENCE_DEFAULTS.radiusM, 10, 2000),
    minAccuracyM: clamp(c.minAccuracyM, GEOFENCE_DEFAULTS.minAccuracyM, 10, 1000),
    minStaySeconds: clamp(c.minStaySeconds, GEOFENCE_DEFAULTS.minStaySeconds, 0, 600),
    requireVerifiedPin: typeof c.requireVerifiedPin === "boolean" ? c.requireVerifiedPin : GEOFENCE_DEFAULTS.requireVerifiedPin,
  };
}

export async function getGeofenceConfig(): Promise<GeofenceConfig> {
  const row = await db.appSetting.findUnique({ where: { key: GEOFENCE_KEY } }).catch(() => null);
  return sanitize({ ...GEOFENCE_DEFAULTS, ...((row?.value as Partial<GeofenceConfig>) ?? {}) });
}

export async function patchGeofenceConfig(patch: Partial<GeofenceConfig>, updatedBy?: string | null): Promise<GeofenceConfig> {
  const next = sanitize({ ...(await getGeofenceConfig()), ...patch });
  await db.appSetting.upsert({
    where: { key: GEOFENCE_KEY },
    create: { key: GEOFENCE_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}
