/* =============================================================
   DOODLY Pure Rewards — loyalty configuration service (singleton).
   Every earning rate, redemption ratio, tier threshold and expiry
   window lives in one row so the whole programme is admin-tunable
   with no code change. Mirrors the DeliveryConfig pattern: upsert
   get-or-create + clamped, change-tracked updates for the audit.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

const ID = "singleton";

/** Tier ladder — derived from LIFETIME points earned (redeeming never demotes).
    Admin can override thresholds + benefit copy via LoyaltyConfig.tiers (JSON). */
export interface Tier { key: string; name: string; min: number; benefits: string[] }
export const DEFAULT_TIERS: Tier[] = [
  { key: "fresh", name: "Fresh Member", min: 0, benefits: ["Access to Rewards", "Birthday Bonus", "Referral Program"] },
  { key: "silver", name: "Silver Member", min: 1000, benefits: ["2% Additional Wallet Cashback (selected campaigns)", "Early Access to Offers", "Priority Customer Support"] },
  { key: "gold", name: "Gold Member", min: 3000, benefits: ["5% Extra Reward Points during campaigns", "Free Surprise Dairy Gift (selected campaigns)", "Faster Support"] },
  { key: "platinum", name: "Platinum Member", min: 6000, benefits: ["Exclusive Products", "Priority Delivery", "Special Festival Gifts", "VIP Customer Support", "Exclusive Events & Promotions"] },
];

const clampInt = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const clampFloat = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));

type Cfg = Awaited<ReturnType<typeof db.loyaltyConfig.upsert>>;
function serialize(c: Cfg) {
  return {
    ...c,
    tiers: (Array.isArray(c.tiers) ? c.tiers : DEFAULT_TIERS) as unknown as Tier[],
    campaignEndsAt: c.campaignEndsAt ? c.campaignEndsAt.toISOString() : null,
    updatedAt: c.updatedAt.toISOString(),
  };
}
export type LoyaltyConfig = ReturnType<typeof serialize>;

/** Load the singleton, creating defaults (incl. the default tier ladder) on first access. */
export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  const c = await db.loyaltyConfig.upsert({
    where: { id: ID },
    create: { id: ID, tiers: DEFAULT_TIERS as unknown as object },
    update: {},
  });
  return serialize(c);
}

/** Is the programme live right now? (single source of truth for every hook) */
export async function loyaltyEnabled(): Promise<boolean> {
  try { return (await getLoyaltyConfig()).enabled; } catch { return false; }
}

/** Resolve the tier for a given lifetime-earned total. */
export function tierFor(lifetimeEarned: number, tiers: Tier[] = DEFAULT_TIERS): Tier {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  let cur = sorted[0];
  for (const t of sorted) if (lifetimeEarned >= t.min) cur = t;
  return cur;
}

/** The next tier up (or null at the top), with points remaining to reach it. */
export function nextTierFor(lifetimeEarned: number, tiers: Tier[] = DEFAULT_TIERS): { tier: Tier; pointsAway: number } | null {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  const up = sorted.find((t) => t.min > lifetimeEarned);
  return up ? { tier: up, pointsAway: up.min - lifetimeEarned } : null;
}

// The numeric earn/redeem/expiry fields the admin can tune, with safe bounds.
const INT_FIELDS: Record<string, [number, number]> = {
  pointsPerHundred: [0, 100000],
  earnRegistration: [0, 1_000_000], earnProfile: [0, 1_000_000],
  earnSubscribe30: [0, 1_000_000], earnSubscribe90: [0, 1_000_000],
  earnReferral: [0, 1_000_000], earnBottleReturn: [0, 100_000],
  earnRenewal: [0, 1_000_000], earnStreak12: [0, 1_000_000],
  earnBirthday: [0, 1_000_000], earnAnniversary: [0, 1_000_000],
  earnPuzzlePlay: [0, 1_000_000], earnPuzzleWin: [0, 10_000_000],
  earnReview: [0, 1_000_000],
  redeemPointsPerRupee: [1, 100000], minRedeemPoints: [0, 10_000_000],
  expiryDays: [1, 3650],
};

const TRACKED = [...Object.keys(INT_FIELDS), "enabled", "remindDays", "tiers", "campaignMultiplier", "campaignEndsAt"] as const;

export async function updateLoyaltyConfig(patch: Record<string, unknown>, actor: Actor) {
  const cur = await db.loyaltyConfig.upsert({ where: { id: ID }, create: { id: ID, tiers: DEFAULT_TIERS as unknown as object }, update: {} });

  const data: Record<string, unknown> = {};
  for (const [f, [lo, hi]] of Object.entries(INT_FIELDS)) {
    if (patch[f] != null) data[f] = clampInt(patch[f], lo, hi);
  }
  if (patch.enabled != null) data.enabled = !!patch.enabled;
  if (patch.campaignMultiplier != null) data.campaignMultiplier = clampFloat(patch.campaignMultiplier, 1, 10);
  if (patch.campaignEndsAt !== undefined) {
    const v = patch.campaignEndsAt;
    data.campaignEndsAt = v ? new Date(String(v)) : null;
  }
  if (Array.isArray(patch.remindDays)) {
    data.remindDays = [...new Set((patch.remindDays as unknown[]).map((n) => clampInt(n, 1, 365)))].sort((a, b) => b - a);
  }
  if (Array.isArray(patch.tiers)) {
    const clean = (patch.tiers as unknown[])
      .map((t) => t as Record<string, unknown>)
      .filter((t) => t && typeof t.name === "string")
      .map((t) => ({
        key: String(t.key || String(t.name).toLowerCase().replace(/\s+/g, "-")).slice(0, 40),
        name: String(t.name).slice(0, 60),
        min: clampInt(t.min, 0, 100_000_000),
        benefits: Array.isArray(t.benefits) ? (t.benefits as unknown[]).map((b) => String(b).slice(0, 200)).slice(0, 12) : [],
      }))
      .sort((a, b) => a.min - b.min);
    if (clean.length) data.tiers = clean as unknown as object;
  }

  // guard: redemption ratio must be positive (avoid divide-by-zero at redeem time)
  const ratio = (data.redeemPointsPerRupee ?? cur.redeemPointsPerRupee) as number;
  if (ratio < 1) data.redeemPointsPerRupee = 1;

  data.updatedBy = actor.actorRole ?? null;
  const next = await db.loyaltyConfig.update({ where: { id: ID }, data });

  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of TRACKED) {
    const a = (cur as Record<string, unknown>)[f], b = (next as Record<string, unknown>)[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: f, from: a, to: b });
  }
  return { config: serialize(next), changes };
}
