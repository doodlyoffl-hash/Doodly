/* =============================================================
   DOODLY — Driver-pay ESTIMATE from GPS distance.
   Pure computation: given a shift's ACTUAL (GPS, fraud-filtered) km + completed
   deliveries, and the tunable rate policy, produce a transparent breakdown and
   a total. An ESTIMATE for ops planning — it never moves money or creates a
   payout. Reused by the GPS distance report + the admin live-tracking view.
   ============================================================= */
import type { DriverPayConfig } from "@/lib/delivery/pay-config";

export interface PayEstimate {
  enabled: boolean;
  base: number;
  distancePay: number;
  fuelReimbursement: number;
  deliveryPay: number;
  subtotal: number;
  total: number;             // max(minShiftPay, subtotal) — the floor for a worked shift
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estimateDriverPay(input: { actualKm: number; deliveries: number }, cfg: DriverPayConfig): PayEstimate {
  if (!cfg.enabled) return { enabled: false, base: 0, distancePay: 0, fuelReimbursement: 0, deliveryPay: 0, subtotal: 0, total: 0 };
  const km = Math.max(0, input.actualKm || 0);
  const del = Math.max(0, input.deliveries || 0);
  const base = cfg.baseShiftPay;
  const distancePay = km * cfg.perKmRate;
  const fuelReimbursement = km * cfg.fuelPerKm;
  const deliveryPay = del * cfg.perDeliveryRate;
  const subtotal = base + distancePay + fuelReimbursement + deliveryPay;
  const total = Math.max(cfg.minShiftPay, subtotal);
  return { enabled: true, base: r2(base), distancePay: r2(distancePay), fuelReimbursement: r2(fuelReimbursement), deliveryPay: r2(deliveryPay), subtotal: r2(subtotal), total: r2(total) };
}

/** Human-readable "how it's computed" line, e.g. "₹6/km + ₹4/km fuel + ₹8/delivery + ₹150 base, min ₹250".
    Zero-value components are omitted so the line reflects only the rates in effect. */
export function payRateBasis(cfg: DriverPayConfig): string {
  if (!cfg.enabled) return "pay estimate off";
  const parts: string[] = [];
  if (cfg.perKmRate) parts.push(`₹${cfg.perKmRate}/km`);
  if (cfg.fuelPerKm) parts.push(`₹${cfg.fuelPerKm}/km fuel`);
  if (cfg.perDeliveryRate) parts.push(`₹${cfg.perDeliveryRate}/delivery`);
  if (cfg.baseShiftPay) parts.push(`₹${cfg.baseShiftPay} base`);
  let s = parts.join(" + ") || "₹0";
  if (cfg.minShiftPay) s += `, min ₹${cfg.minShiftPay}`;
  return s;
}
