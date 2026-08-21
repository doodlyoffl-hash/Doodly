/* =============================================================
   Exit-Intent recovery offer — campaign config (AppSetting-backed).

   A one-time extra-10% popup for a visitor showing genuine exit intent.
   The popup carries NO discount logic of its own: it hands the existing
   coupon `couponCode` to checkout, which validates + redeems it through
   the normal Coupon engine (/api/coupons/validate → redeemCoupon), so the
   BACKEND remains the single authority on one-time usage, eligibility and
   expiry (Coupon.perCustomerLimit + CouponRedemption). This module stores
   ONLY presentation/targeting config (no money maths) in AppSetting
   `campaign.exitIntent` — key-value, no migration, admin-editable live.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";

const KEY = "campaign.exitIntent";

export type ExitIntentConfig = {
  enabled: boolean;
  couponCode: string;          // must exist in the Coupon engine (PERCENT, perCustomerLimit 1)
  campaign: string;            // analytics/state namespace
  frequency: "customer" | "session" | "campaign";
  cooldownDays: number;        // re-eligible this long after a dismissal
  requireProductView: boolean; // only after the visitor saw a product
  idleMsMobile: number;        // mobile inactivity-after-intent fallback
  startsAt: string | null;     // optional ISO schedule window
  endsAt: string | null;
  heading: string; offer: string; sub: string;
  cta: string; dismiss: string; badge: string; note: string;
};

export const EXIT_INTENT_DEFAULT: ExitIntentConfig = {
  enabled: true,
  couponCode: "EXIT10",
  campaign: "exit-intent",
  frequency: "customer",
  cooldownDays: 7,
  requireProductView: true,
  idleMsMobile: 15000,
  startsAt: null,
  endsAt: null,
  heading: "Before you go… 🥛",
  offer: "Get an EXTRA 10% OFF",
  sub: "Your fresh DOODLY order is waiting — here's an exclusive treat before you leave.",
  cta: "Claim 10% OFF",
  dismiss: "No thanks",
  badge: "10%",
  note: "One-time offer · applied at checkout",
};

const STR = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);
const BOOL = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const INT = (v: unknown, d: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const FREQ = (v: unknown): ExitIntentConfig["frequency"] =>
  v === "session" || v === "campaign" ? v : "customer";
const ISO = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Coerce an arbitrary stored/patch object into a complete, safe config. */
export function normalizeExitIntent(raw: unknown, base: ExitIntentConfig = EXIT_INTENT_DEFAULT): ExitIntentConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(r, k);
  return {
    enabled: BOOL(r.enabled, base.enabled),
    // coupon codes are uppercased everywhere in the engine
    couponCode: STR(r.couponCode, base.couponCode).trim().toUpperCase(),
    campaign: STR(r.campaign, base.campaign).trim(),
    frequency: has("frequency") ? FREQ(r.frequency) : base.frequency,
    cooldownDays: INT(has("cooldownDays") ? r.cooldownDays : base.cooldownDays, base.cooldownDays, 0, 365),
    requireProductView: BOOL(r.requireProductView, base.requireProductView),
    idleMsMobile: INT(has("idleMsMobile") ? r.idleMsMobile : base.idleMsMobile, base.idleMsMobile, 4000, 120000),
    startsAt: has("startsAt") ? ISO(r.startsAt) : base.startsAt,
    endsAt: has("endsAt") ? ISO(r.endsAt) : base.endsAt,
    heading: STR(r.heading, base.heading),
    offer: STR(r.offer, base.offer),
    sub: STR(r.sub, base.sub),
    cta: STR(r.cta, base.cta),
    dismiss: STR(r.dismiss, base.dismiss),
    badge: STR(r.badge, base.badge),
    note: STR(r.note, base.note),
  };
}

export async function getExitIntentConfig(): Promise<ExitIntentConfig> {
  try {
    const s = await db.appSetting.findUnique({ where: { key: KEY } });
    return normalizeExitIntent(s?.value);
  } catch {
    return EXIT_INTENT_DEFAULT;
  }
}

/** Merge a partial patch onto the stored config and persist it. */
export async function setExitIntentConfig(patch: unknown, updatedBy?: string): Promise<ExitIntentConfig> {
  const current = await getExitIntentConfig();
  const next = normalizeExitIntent(patch, current);   // patch wins, current fills gaps
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as object, updatedBy },
    update: { value: next as object, updatedBy },
  });
  return next;
}
