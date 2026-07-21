/* =============================================================
   DOODLY — Milk cost config (the editable seasonal rates).
   Singleton row (id="singleton"), same pattern as QualityConfig. Read gives
   defaults when the row is absent, so the engine works before first save.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import type { CostRates } from "@/lib/milk/cost";

export interface MilkConfig extends CostRates {
  currency: string;
  taxBps: number;
  financialYear: string | null;
}

export const MILK_CONFIG_DEFAULTS: MilkConfig = {
  conversionFactor: 1.03,
  milkRatePaise: 450,      // ₹4.50 / litre
  fatRatePaise: 82000,     // ₹820 / kg-fat
  transportPaise: 950000,  // ₹9,500 / tanker
  currency: "INR",
  taxBps: 0,
  financialYear: null,
};

export async function getMilkConfig(): Promise<MilkConfig> {
  const row = await db.milkCostConfig.findUnique({ where: { id: "singleton" } });
  if (!row) return { ...MILK_CONFIG_DEFAULTS };
  return {
    conversionFactor: row.conversionFactor,
    milkRatePaise: row.milkRatePaise,
    fatRatePaise: row.fatRatePaise,
    transportPaise: row.transportPaise,
    currency: row.currency,
    taxBps: row.taxBps,
    financialYear: row.financialYear,
  };
}

export async function setMilkConfig(patch: Partial<MilkConfig>, actor?: { actorId?: string; actorRole?: string }): Promise<MilkConfig> {
  const clean: Record<string, unknown> = {};
  // Positive-number guards: a zero conversion factor would divide-by-zero, and
  // negative rates would invert the P&L. Rates are optional per-field patches.
  if (patch.conversionFactor !== undefined) {
    const f = Number(patch.conversionFactor);
    if (!(f > 0)) throw new Error("Conversion factor must be greater than 0.");
    clean.conversionFactor = f;
  }
  if (patch.milkRatePaise !== undefined) clean.milkRatePaise = Math.max(0, Math.round(Number(patch.milkRatePaise) || 0));
  if (patch.fatRatePaise !== undefined) clean.fatRatePaise = Math.max(0, Math.round(Number(patch.fatRatePaise) || 0));
  if (patch.transportPaise !== undefined) clean.transportPaise = Math.max(0, Math.round(Number(patch.transportPaise) || 0));
  if (patch.currency !== undefined) clean.currency = String(patch.currency).slice(0, 8) || "INR";
  if (patch.taxBps !== undefined) clean.taxBps = Math.max(0, Math.min(10000, Math.round(Number(patch.taxBps) || 0)));
  if (patch.financialYear !== undefined) clean.financialYear = patch.financialYear ? String(patch.financialYear).slice(0, 16) : null;

  await db.milkCostConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...MILK_CONFIG_DEFAULTS, ...clean, updatedBy: actor?.actorId ?? null },
    update: { ...clean, updatedBy: actor?.actorId ?? null },
  });
  await audit({
    userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system",
    action: "milk.config.update", target: JSON.stringify(clean).slice(0, 180),
  }).catch(() => {});
  return getMilkConfig();
}
