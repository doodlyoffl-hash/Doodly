/* =============================================================
   DOODLY — Solids COGS via milk-equivalent yields (Super-Admin config).
   A B2B sale of a SOLID (paneer / ghee / kova / curd) consumes raw milk to make.
   Milk inventory (tanker FIFO) is the only COGS source, so to cost a solid sale we
   convert the sold weight to its milk-equivalent litres: litres = KG × yield[slug]
   (litres of milk per KG of that solid). One AppSetting row ("b2b.solids.cogs") so
   yields tune with no deploy. OPT-IN (default OFF): solids stay revenue-only until a
   Super-Admin sets real yields and enables it — no guessed number ever silently
   changes the P&L. Defaults below are illustrative buffalo-milk figures to REVIEW.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

/** Solid product slugs whose sales can draw milk inventory (curd/paneer/kova/ghee). */
export const SOLID_SLUGS = ["paneer", "ghee", "kova", "curd"] as const;
export type SolidSlug = (typeof SOLID_SLUGS)[number];

export interface SolidsCogsConfig {
  enabled: boolean;
  /** litres of raw milk per KG of the solid (0 = don't cost this solid). */
  yields: Record<SolidSlug, number>;
}

export const SOLIDS_COGS_KEY = "b2b.solids.cogs";

// Illustrative buffalo-milk yields (L of milk per KG) — the owner should set real ones.
export const SOLIDS_COGS_DEFAULTS: SolidsCogsConfig = {
  enabled: false,
  yields: { paneer: 5, ghee: 22, kova: 5.5, curd: 1 },
};

const clampY = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 1000) / 1000)) : d; };

function sanitize(c: Partial<SolidsCogsConfig>): SolidsCogsConfig {
  const y = (c.yields ?? {}) as Partial<Record<SolidSlug, number>>;
  return {
    enabled: typeof c.enabled === "boolean" ? c.enabled : SOLIDS_COGS_DEFAULTS.enabled,
    yields: {
      paneer: clampY(y.paneer, SOLIDS_COGS_DEFAULTS.yields.paneer),
      ghee: clampY(y.ghee, SOLIDS_COGS_DEFAULTS.yields.ghee),
      kova: clampY(y.kova, SOLIDS_COGS_DEFAULTS.yields.kova),
      curd: clampY(y.curd, SOLIDS_COGS_DEFAULTS.yields.curd),
    },
  };
}

export async function getSolidsCogsConfig(): Promise<SolidsCogsConfig> {
  const row = await db.appSetting.findUnique({ where: { key: SOLIDS_COGS_KEY } }).catch(() => null);
  return sanitize({ ...SOLIDS_COGS_DEFAULTS, ...((row?.value as Partial<SolidsCogsConfig>) ?? {}) });
}

export async function patchSolidsCogsConfig(patch: Partial<SolidsCogsConfig>, updatedBy?: string | null): Promise<SolidsCogsConfig> {
  const cur = await getSolidsCogsConfig();
  const next = sanitize({ enabled: patch.enabled ?? cur.enabled, yields: { ...cur.yields, ...(patch.yields ?? {}) } });
  await db.appSetting.upsert({
    where: { key: SOLIDS_COGS_KEY },
    create: { key: SOLIDS_COGS_KEY, value: next as object, updatedBy: updatedBy ?? null },
    update: { value: next as object, updatedBy: updatedBy ?? null },
  });
  return next;
}
