/* =============================================================
   Brand-story CMS merge — PURE (no DB, no I/O). Applies a bounded
   admin override (JSON patch) over the config/brand-story.ts
   defaults so the /doodly page can be edited with no code change.
   ============================================================= */
import { BRAND_STORY, type BrandStory } from "@/config/brand-story";

/** The editable subset surfaced in the Admin → Brand Story CMS. */
export interface BrandStoryOverride {
  heroEyebrow?: string;
  heroTitle?: string;
  heroLead?: string;
  heroSub?: string;
  hookTitle?: string;
  hookLine?: string;
  qrDestination?: string;
  orderHref?: string;
  productsHref?: string;
  subscribeHref?: string;
}

const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Sanitise an arbitrary JSON blob into a typed, safe override. */
export function parseOverride(raw: unknown): BrandStoryOverride {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: BrandStoryOverride = {};
  for (const k of ["heroEyebrow", "heroTitle", "heroLead", "heroSub", "hookTitle", "hookLine", "qrDestination", "orderHref", "productsHref", "subscribeHref"] as const) {
    const v = pick(o[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** The mutable subset the merge writes to (defaults carry readonly literal types). */
interface EditableStory {
  hero: { eyebrow: string; title: string; lead: string; sub: string };
  hook: { title: string; lines: string[] };
  qrDestination: string;
  connect: { ctas: { label: string; href: string; kind: "primary" | "secondary" }[] };
}

/** Deep-clone the defaults and apply the override. Returns a plain object. */
export function mergeBrandStory(override: BrandStoryOverride = {}, base: BrandStory = BRAND_STORY): BrandStory {
  const s = structuredClone(base) as unknown as EditableStory;

  if (override.heroEyebrow) s.hero.eyebrow = override.heroEyebrow;
  if (override.heroTitle) s.hero.title = override.heroTitle;
  if (override.heroLead) s.hero.lead = override.heroLead;
  if (override.heroSub) s.hero.sub = override.heroSub;
  if (override.hookTitle) s.hook.title = override.hookTitle;
  if (override.hookLine) s.hook.lines = [override.hookLine];
  if (override.qrDestination) s.qrDestination = override.qrDestination;

  // CTA href overrides by label (Order Now / View Products / Subscribe Today)
  for (const cta of s.connect.ctas) {
    if (override.orderHref && /order/i.test(cta.label)) cta.href = override.orderHref;
    if (override.productsHref && /product/i.test(cta.label)) cta.href = override.productsHref;
    if (override.subscribeHref && /subscribe/i.test(cta.label)) cta.href = override.subscribeHref;
  }
  return s as unknown as BrandStory;
}
