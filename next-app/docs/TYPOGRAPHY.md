# DOODLY — Typography System

A distinctive, premium, dairy-inspired type system. The goal: the moment you read
the page it feels like a *crafted dairy brand*, not a default template.

## The voice: two variable typefaces

| Role | Typeface | Why |
|---|---|---|
| **Display / headings** | **Fraunces** (variable, `opsz` axis) | A warm "soft serif" with true **optical sizing** — as headings grow, the cut refines automatically. Editorial, crafted, farm-to-home premium. |
| **Body / UI** | **Hanken Grotesk** (variable) | A humanist grotesque: friendly, warm, and exceptionally legible on Windows, macOS, Android and iOS. |

Both are loaded with `next/font/google` (`app/layout.tsx`) → self-hosted, preloaded,
`display: swap`, with a metric-matched fallback so **CLS ≈ 0**. Exposed as CSS vars
`--font-display` and `--font-sans` on `<html>`, mapped to Tailwind `font-display` / `font-sans`.

> Headings get `font-optical-sizing: auto` + `text-wrap: balance`; body gets
> `text-wrap: pretty`. Body is antialiased with `optimizeLegibility` + kerning/ligatures.

## The scale

Sizes are **fluid** — `clamp(min @≈320px, preferred, max @≈1440px+)` — so headings are
restrained on mobile and generous (never shouty) on desktop. Tokens live in
`app/globals.css` (`:root`), consumed by the `.t-*` utilities **and** by Tailwind's
`text-*` scale (so existing markup is upgraded automatically).

| Token / class | Font | Size (min → max) | Line height | Tracking | Weight |
|---|---|---|---|---|---|
| `.t-display-xl` | Fraunces | 44 → 72px | 1.02 | −0.028em | 600 |
| `.t-display`    | Fraunces | 36 → 56px | 1.05 | −0.024em | 600 |
| `.t-h1`         | Fraunces | 32 → 48px | 1.10 | −0.020em | 600 |
| `.t-h2`         | Fraunces | 26 → 36px | 1.14 | −0.018em | 600 |
| `.t-h3`         | Fraunces | 22 → 28px | 1.20 | −0.014em | 600 |
| `.t-h4`         | Fraunces | 18 → 22px | 1.30 | −0.010em | 600 |
| `.t-h5`         | Fraunces | 18px      | 1.40 | −0.006em | 600 |
| `.t-h6`         | Fraunces | 16px      | 1.50 | 0        | 600 |
| `.t-body-lg`    | Hanken   | 18px      | 1.70 | 0        | 400 |
| `.t-body`       | Hanken   | 16px      | 1.70 | 0        | 400 |
| `.t-body-sm`    | Hanken   | 15px      | 1.60 | 0        | 400 |
| `.t-caption`    | Hanken   | 13px      | 1.50 | +0.005em | 400 |
| `.t-label`      | Hanken   | 14px      | 1.40 | 0        | 500 |
| `.t-button`     | Hanken   | 14px      | 1.0  | +0.005em | 600 |
| `.t-nav`        | Hanken   | 14px      | 1.0  | +0.005em | 500 |
| `.t-footer`     | Hanken   | 14px      | 1.60 | 0        | 400 |
| `.t-overline`   | Hanken   | 12px      | 1.0  | +0.18em  | 700, uppercase |

### Tailwind mapping (auto-upgrades existing components)
`text-2xl→h3 · text-3xl→h2 · text-4xl→h1 · text-5xl→display · text-6xl/7xl→display-xl`,
each with the matching line-height + negative tracking. Body sizes `text-xs→caption (13)`,
`text-sm→label (14)`, `text-base→body (16/1.7)`, `text-lg→body-lg (18/1.7)`.

## Usage

- **New markup:** prefer the semantic classes — `<h2 className="t-h2">`, `<p className="t-body">`,
  eyebrows as `<p className="t-overline text-leaf-600">`.
- **Section header pattern** (used site-wide): `t-overline` → `t-h1`/`t-h2` → `t-body-lg`.
- **Reading measure:** wrap long-form copy in `.t-measure` (or Tailwind `max-w-measure`, ≈66 chars).
- Existing components using Tailwind `text-*` already inherit the refined scale — no rewrite needed.

## Responsive
Every display size uses `clamp()`, tuned across Mobile (320–767), Tablet (768–1023),
Laptop (1024–1439), Desktop (1440+). No oversized mobile headings, no tiny desktop text.

## Accessibility
- Body ≥ 16px; smallest UI text is 13px (captions/badges) — above the 12px floor for dense UI.
- Muted text uses `ink-3 (#5E7167)` for AA contrast on white (≈4.9:1).
- `.t-measure` keeps line length readable (~66 chars).
- Headings use weight 600 (not hairline) for legibility; `prefers-reduced-motion` respected globally.

## Performance
- `next/font` self-hosts + preloads both variable fonts; `display: swap` + fallback metrics → ~0 CLS.
- Two variable woff2 files only (Fraunces `opsz` + Hanken Grotesk). No render-blocking `<link>`.

## Don't
- Don't hardcode `font-family`, raw px font-sizes, or ad-hoc `tracking-[…]` eyebrows — use the tokens.
- Don't reintroduce Inter / Plus Jakarta / system-only stacks; the pairing **is** the brand.
