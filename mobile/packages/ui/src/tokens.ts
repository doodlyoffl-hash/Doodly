/* =============================================================
   DOODLY — Design tokens (mobile).
   Ported VERBATIM from the web design system (assets/css/styles.css
   + type.css) so the apps and the website are visibly one brand. If a
   value changes on the web, change it here too — these are the same
   palette, not a mobile reinterpretation.

   Both themes are first-class: `light` mirrors the web's :root and
   `dark` mirrors its dark-mode block. Never hardcode a hex in a screen;
   read from useTheme() so dark mode stays correct everywhere.
   ============================================================= */

/** Brand-constant colours — identical in both themes. */
const constant = {
  gold: "#E8B864",
} as const;

export const palette = {
  light: {
    /* grounds */
    milk: "#FBFCFA",
    milk2: "#F2F6F1",
    surface: "#FFFFFF",
    surface2: "#F6FAF6",
    /* brand */
    forest: "#0F3D2E",
    forest700: "#15533E",
    leaf: "#1FAE66",
    leaf600: "#169A57",
    mint: "#8FE3B5",
    mintSoft: "#E4F6EC",
    gold: constant.gold,
    goldSoft: "#FBF0D9",
    /* text */
    ink: "#0B1F17",
    ink2: "#3A4D44",
    ink3: "#6B7E74",
    /* structure */
    line: "#E7EEE9",
  },
  dark: {
    milk: "#07140E",
    milk2: "#0A1B13",
    surface: "#0E2018",
    surface2: "#102619",
    /* NB: in dark mode `forest` inverts to a pale mint — it is the
       high-contrast brand text colour, not the deep green ground. */
    forest: "#DFF3E6",
    forest700: "#BFE8CF",
    leaf: "#34D27F",
    leaf600: "#2CC674",
    mint: "#6FD6A0",
    mintSoft: "#133024",
    gold: constant.gold,
    goldSoft: "#2A2415",
    ink: "#ECF6EF",
    ink2: "#B9CCC0",
    ink3: "#8AA294",
    line: "#1C3527",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = (typeof palette)[ColorScheme];

/** Semantic colours for state. Deliberately separate from the brand
 *  accent so "success" never reads as "this is the DOODLY green". */
export const semantic = {
  success: "#1FAE66",
  warning: "#E8B864",
  danger: "#D6453D",
  info: "#3E7FB8",
} as const;

/** Corner radii — web --r-sm / --r / --r-lg / --r-xl. */
export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
} as const;

/** 4pt spacing scale. Lay out with gap/padding from this scale only. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Type scale. `display` = Fraunces (headings, numbers that should feel
 *  editorial); `body` = Hanken Grotesk (everything read in running text). */
export const font = {
  display: "Fraunces_600SemiBold",
  displayBold: "Fraunces_700Bold",
  body: "HankenGrotesk_400Regular",
  bodyMedium: "HankenGrotesk_500Medium",
  bodySemi: "HankenGrotesk_600SemiBold",
  bodyBold: "HankenGrotesk_700Bold",
} as const;

export const type = {
  hero: { fontFamily: font.displayBold, fontSize: 34, lineHeight: 40 },
  h1: { fontFamily: font.display, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: font.display, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: font.bodySemi, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 24 },
  bodyMed: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.body, fontSize: 12, lineHeight: 16 },
  /** Uppercase micro-labels — the web pairs these with letter-spacing. */
  label: { fontFamily: font.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" as const },
  /** Money/counts in columns — keeps digits from jittering as they update. */
  numeric: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] as const },
} as const;

/** Shadows carry the web's forest tint rather than neutral black.
 *  iOS reads shadow*, Android reads elevation — both are set. */
export const shadow = {
  sm: {
    shadowColor: "#0F3D2E", shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  md: {
    shadowColor: "#0F3D2E", shadowOpacity: 0.1, shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  lg: {
    shadowColor: "#0F3D2E", shadowOpacity: 0.16, shadowRadius: 60,
    shadowOffset: { width: 0, height: 24 }, elevation: 12,
  },
} as const;

/** Minimum touch target (both platforms' accessibility guidance). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TAP = 44;
