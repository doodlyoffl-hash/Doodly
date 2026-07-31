/* =============================================================
   DOODLY — Driver-pay ESTIMATE policy (Super-Admin / Operations).
   One AppSetting row ("driver.pay.config") of tunable rates so the pay estimate
   derived from GPS distance updates with no deploy. This is an ESTIMATE for ops
   planning only — it moves no money and creates no payout. Mirrors the
   gps-tracking / geo-correction config pattern.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface DriverPayConfig {
  enabled: boolean;
  perKmRate: number;        // ₹ per GPS-km travelled (distance pay / incentive)
  fuelPerKm: number;        // ₹ per km fuel reimbursement
  perDeliveryRate: number;  // ₹ per completed delivery
  baseShiftPay: number;     // ₹ flat, per worked shift
  minShiftPay: number;      // ₹ floor for a worked shift
}

export const DRIVER_PAY_KEY = "driver.pay.config";

// Illustrative starting rates — Operations should set the business's real numbers.
export const DRIVER_PAY_DEFAULTS: DriverPayConfig = {
  enabled: true,
  perKmRate: 6,
  fuelPerKm: 4,
  perDeliveryRate: 8,
  baseShiftPay: 150,
  minShiftPay: 250,
};

const clamp = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n * 100) / 100)) : d; };

function sanitize(c: Partial<DriverPayConfig>): DriverPayConfig {
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : DRIVER_PAY_DEFAULTS.enabled,
    perKmRate: clamp(c.perKmRate, DRIVER_PAY_DEFAULTS.perKmRate, 0, 1000),
    fuelPerKm: clamp(c.fuelPerKm, DRIVER_PAY_DEFAULTS.fuelPerKm, 0, 1000),
    perDeliveryRate: clamp(c.perDeliveryRate, DRIVER_PAY_DEFAULTS.perDeliveryRate, 0, 10000),
    baseShiftPay: clamp(c.baseShiftPay, DRIVER_PAY_DEFAULTS.baseShiftPay, 0, 100000),
    minShiftPay: clamp(c.minShiftPay, DRIVER_PAY_DEFAULTS.minShiftPay, 0, 100000),
  };
}

export async function getDriverPayConfig(): Promise<DriverPayConfig> {
  const row = await db.appSetting.findUnique({ where: { key: DRIVER_PAY_KEY } }).catch(() => null);
  return sanitize({ ...DRIVER_PAY_DEFAULTS, ...((row?.value as Partial<DriverPayConfig>) ?? {}) });
}

export async function patchDriverPayConfig(patch: Partial<DriverPayConfig>, updatedBy?: string | null): Promise<DriverPayConfig> {
  const next = sanitize({ ...(await getDriverPayConfig()), ...patch });
  await db.appSetting.upsert({
    where: { key: DRIVER_PAY_KEY },
    create: { key: DRIVER_PAY_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}
