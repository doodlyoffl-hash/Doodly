/* =============================================================
   DOODLY — Warehouse configuration (Super-Admin only)
   The single origin for all delivery distance/travel-time calculations.
   Stored as one AppSetting row (key "warehouse.config") so it's editable
   with no deploy; shaped so a future `warehouses[]` array + per-zone origin
   is an additive change. Replaces the hard-coded map origin.
   Default = the DOODLY warehouse (Vijayawada).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface Warehouse {
  name: string;
  lat: number;
  lng: number;
  address: string;
  /** Max plausible delivery radius (km). Coordinates farther than this from the
      warehouse are treated as a mis-geocode and rejected/flagged. */
  maxDeliveryRadiusKm: number;
}

export const WAREHOUSE_KEY = "warehouse.config";

export const WAREHOUSE_DEFAULTS: Warehouse = {
  name: "DOODLY Warehouse",
  lat: 16.50862464703653,
  lng: 80.61739648666206,
  address: "Vijayawada, Andhra Pradesh",
  maxDeliveryRadiusKm: 75,
};

function sanitize(w: Partial<Warehouse>): Warehouse {
  const num = (v: unknown, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
  const lat = num(w.lat, WAREHOUSE_DEFAULTS.lat);
  const lng = num(w.lng, WAREHOUSE_DEFAULTS.lng);
  return {
    name: (typeof w.name === "string" && w.name.trim()) || WAREHOUSE_DEFAULTS.name,
    lat: lat >= -90 && lat <= 90 ? lat : WAREHOUSE_DEFAULTS.lat,
    lng: lng >= -180 && lng <= 180 ? lng : WAREHOUSE_DEFAULTS.lng,
    address: (typeof w.address === "string" && w.address.trim()) || WAREHOUSE_DEFAULTS.address,
    maxDeliveryRadiusKm: Math.min(2000, Math.max(1, Math.round(num(w.maxDeliveryRadiusKm, WAREHOUSE_DEFAULTS.maxDeliveryRadiusKm)))),
  };
}

/** The active warehouse origin (defaults merged over the stored blob). */
export async function getWarehouse(): Promise<Warehouse> {
  const row = await db.appSetting.findUnique({ where: { key: WAREHOUSE_KEY } }).catch(() => null);
  return sanitize({ ...WAREHOUSE_DEFAULTS, ...((row?.value as Partial<Warehouse>) ?? {}) });
}

/** Read-modify-write the warehouse config (never clobbers unspecified fields). Super-Admin only (gate at the route). */
export async function patchWarehouse(patch: Partial<Warehouse>, updatedBy?: string | null): Promise<Warehouse> {
  const next = sanitize({ ...(await getWarehouse()), ...patch });
  await db.appSetting.upsert({
    where: { key: WAREHOUSE_KEY },
    create: { key: WAREHOUSE_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}
