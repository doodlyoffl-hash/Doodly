import { Fragment } from "react";

/* =============================================================
   DOODLY — premium quality-promise marquee (server component → 0 JS).
   Infinite right-to-left ticker built entirely with CSS (see globals.css
   `.dy-marquee`). Seamless loop via two identical sets + translateX(-50%);
   pauses on hover (desktop); respects prefers-reduced-motion (static
   fallback). Screen readers get the canonical list once; all visual
   copies are aria-hidden.
   ============================================================= */

const ITEMS: ReadonlyArray<readonly [emoji: string, label: string]> = [
  ["🥛", "No Preservatives"],
  ["✅", "No Adulterants"],
  ["🌿", "No Antibiotics"],
  ["🐃", "No Induced Hormones"],
] as const;

// Repeats per set so one set always exceeds the widest viewport (gap-free loop,
// safe through 4K). Both sets are identical, so SR never sees the repeats.
const SET_REPEATS = 4;

function Sep() {
  return <span aria-hidden className="select-none px-1 text-leaf-600/50">✦</span>;
}

function Chip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap px-7 text-[13px] font-medium uppercase tracking-[0.14em] text-ink-2">
      <span aria-hidden className="text-[15px] leading-none">{emoji}</span>
      {label}
    </span>
  );
}

/** One full set: every item preceded by a divider → uniform spacing + a clean seam. */
function MarqueeSet() {
  return (
    <div className="dy-marquee__set">
      {Array.from({ length: SET_REPEATS }).map((_, r) =>
        ITEMS.map(([emoji, label]) => (
          <Fragment key={`${r}-${label}`}>
            <Sep />
            <Chip emoji={emoji} label={label} />
          </Fragment>
        )),
      )}
    </div>
  );
}

export function TrustMarquee() {
  return (
    <section aria-label="Our quality promise" className="border-y border-mint-soft bg-white">
      {/* Canonical content for assistive tech — announced once. */}
      <ul className="sr-only">
        {ITEMS.map(([, label]) => <li key={label}>{label}</li>)}
      </ul>

      {/* Animated ticker — decorative; hidden when motion is reduced. */}
      <div className="dy-marquee py-3.5" aria-hidden="true">
        <div className="dy-marquee__track">
          <MarqueeSet />
          <MarqueeSet />
        </div>
      </div>

      {/* Static, centered fallback — shown only under prefers-reduced-motion. */}
      <div className="dy-marquee-static gap-y-1 px-5 py-3.5" aria-hidden="true">
        {ITEMS.map(([emoji, label], i) => (
          <Fragment key={label}>
            {i > 0 && <Sep />}
            <Chip emoji={emoji} label={label} />
          </Fragment>
        ))}
      </div>
    </section>
  );
}
