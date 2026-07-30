/* =============================================================
   DOODLY — Bottle deposit / refund policy (Super-Admin only)
   Controls the bottle-return-pickup refund workflow. Stored as one AppSetting
   row (key "bottle.deposit.config") so policy changes need no deploy.
   Mirrors lib/warehouse/config.ts.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { bottleDepositPaise } from "@/config/catalogue";

export interface BottleDepositConfig {
  enabled: boolean;              // master switch for the pickup/refund feature
  requireVerification: boolean;  // ops must Verify a collection before the refund credits
  autoRefundOnCollection: boolean; // when !requireVerification, refund the instant the exec collects
  partialRefundAllowed: boolean; // refund the collected portion on a partial return
  /** Per-bottle deposit used for refund math. null → fall back to the catalogue default. */
  depositPerBottlePaise: number | null;
}

export const BOTTLE_DEPOSIT_KEY = "bottle.deposit.config";

export const BOTTLE_DEPOSIT_DEFAULTS: BottleDepositConfig = {
  enabled: true,
  requireVerification: false,
  autoRefundOnCollection: true,
  partialRefundAllowed: true,
  depositPerBottlePaise: null,
};

function sanitize(c: Partial<BottleDepositConfig>): BottleDepositConfig {
  const bool = (v: unknown, f: boolean) => (typeof v === "boolean" ? v : f);
  let dep: number | null = BOTTLE_DEPOSIT_DEFAULTS.depositPerBottlePaise;
  if (c.depositPerBottlePaise === null) dep = null;
  else if (c.depositPerBottlePaise != null) { const n = Number(c.depositPerBottlePaise); if (Number.isFinite(n) && n >= 0) dep = Math.round(Math.min(1_000_00, n)); }
  return {
    enabled: bool(c.enabled, BOTTLE_DEPOSIT_DEFAULTS.enabled),
    requireVerification: bool(c.requireVerification, BOTTLE_DEPOSIT_DEFAULTS.requireVerification),
    autoRefundOnCollection: bool(c.autoRefundOnCollection, BOTTLE_DEPOSIT_DEFAULTS.autoRefundOnCollection),
    partialRefundAllowed: bool(c.partialRefundAllowed, BOTTLE_DEPOSIT_DEFAULTS.partialRefundAllowed),
    depositPerBottlePaise: dep,
  };
}

export async function getBottleDepositConfig(): Promise<BottleDepositConfig> {
  const row = await db.appSetting.findUnique({ where: { key: BOTTLE_DEPOSIT_KEY } }).catch(() => null);
  return sanitize({ ...BOTTLE_DEPOSIT_DEFAULTS, ...((row?.value as Partial<BottleDepositConfig>) ?? {}) });
}

export async function patchBottleDepositConfig(patch: Partial<BottleDepositConfig>, updatedBy?: string | null): Promise<BottleDepositConfig> {
  const next = sanitize({ ...(await getBottleDepositConfig()), ...patch });
  await db.appSetting.upsert({
    where: { key: BOTTLE_DEPOSIT_KEY },
    create: { key: BOTTLE_DEPOSIT_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}

/** Effective per-bottle deposit: config override, else the catalogue default (₹120). */
export function effectiveDepositPerBottle(cfg: BottleDepositConfig): number {
  return cfg.depositPerBottlePaise != null ? cfg.depositPerBottlePaise : bottleDepositPaise;
}
