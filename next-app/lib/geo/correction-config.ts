/* =============================================================
   DOODLY — Executive GPS-correction configuration (Super-Admin only)
   Controls the anti-misuse gates for the "Verify / Update Geo Location"
   flow. Stored as one AppSetting row (key "geo.correction.config") so it's
   editable with no deploy. Mirrors lib/warehouse/config.ts.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface GeoCorrectionConfig {
  enabled: boolean;              // master switch for the feature
  maxAccuracyM: number;          // reject a device fix whose accuracy radius is worse than this (metres)
  requireShift: boolean;         // executive must be on-shift (ExecutiveStatus AVAILABLE / on a trip)
  requireAssigned: boolean;      // executive must be the one assigned to the delivery in hand
  enforcePinMatch: boolean;      // new pin must agree with the address's declared PIN-code area (Google-strict)
  largeMoveWarnKm: number;       // old→new moves beyond this surface a "significant change" confirm
}

export const GEO_CORRECTION_KEY = "geo.correction.config";

export const GEO_CORRECTION_DEFAULTS: GeoCorrectionConfig = {
  enabled: true,
  maxAccuracyM: 60,
  requireShift: true,
  requireAssigned: true,
  enforcePinMatch: true,
  largeMoveWarnKm: 0.5,
};

function sanitize(c: Partial<GeoCorrectionConfig>): GeoCorrectionConfig {
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    enabled: bool(c.enabled, GEO_CORRECTION_DEFAULTS.enabled),
    maxAccuracyM: num(c.maxAccuracyM, GEO_CORRECTION_DEFAULTS.maxAccuracyM, 5, 1000),
    requireShift: bool(c.requireShift, GEO_CORRECTION_DEFAULTS.requireShift),
    requireAssigned: bool(c.requireAssigned, GEO_CORRECTION_DEFAULTS.requireAssigned),
    enforcePinMatch: bool(c.enforcePinMatch, GEO_CORRECTION_DEFAULTS.enforcePinMatch),
    largeMoveWarnKm: num(c.largeMoveWarnKm, GEO_CORRECTION_DEFAULTS.largeMoveWarnKm, 0.05, 50),
  };
}

/** The active geo-correction config (defaults merged over the stored blob). */
export async function getGeoCorrectionConfig(): Promise<GeoCorrectionConfig> {
  const row = await db.appSetting.findUnique({ where: { key: GEO_CORRECTION_KEY } }).catch(() => null);
  return sanitize({ ...GEO_CORRECTION_DEFAULTS, ...((row?.value as Partial<GeoCorrectionConfig>) ?? {}) });
}

/** Read-modify-write the config (never clobbers unspecified fields). Super-Admin only (gate at the route). */
export async function patchGeoCorrectionConfig(patch: Partial<GeoCorrectionConfig>, updatedBy?: string | null): Promise<GeoCorrectionConfig> {
  const next = sanitize({ ...(await getGeoCorrectionConfig()), ...patch });
  await db.appSetting.upsert({
    where: { key: GEO_CORRECTION_KEY },
    create: { key: GEO_CORRECTION_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}
