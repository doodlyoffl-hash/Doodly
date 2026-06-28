import type { Config } from "tailwindcss";

// Design tokens mirror assets/css/styles.css from the static build,
// so the Next.js port shares the exact DOODLY palette + type scale.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        milk: "#FBFCFA",
        forest: { DEFAULT: "#0F3D2E", 700: "#15533E" },
        leaf: { DEFAULT: "#1FAE66", 600: "#169A57" },
        mint: { DEFAULT: "#8FE3B5", soft: "#E4F6EC" },
        gold: { DEFAULT: "#E8B864", soft: "#FBF0D9" },
        // ink-3 darkened from #6B7E74 → #5E7167 to clear WCAG AA (≈4.9:1 on white) for muted text.
        ink: { DEFAULT: "#0B1F17", 2: "#3A4D44", 3: "#5E7167" }
      },
      fontFamily: {
        display: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Hanken Grotesk", "system-ui", "sans-serif"]
      },
      // Fluid, intentional type scale (single source = CSS vars in globals.css).
      // Display sizes (2xl→7xl) clamp between breakpoints with tightening tracking;
      // body sizes (xs→xl) get comfortable, consistent line-heights. This upgrades
      // every existing `text-*` usage across the app at once.
      fontSize: {
        xs:   ["var(--fs-caption)", { lineHeight: "1.5", letterSpacing: "0.005em" }],
        sm:   ["var(--fs-label)",   { lineHeight: "1.55" }],
        base: ["var(--fs-body)",    { lineHeight: "1.7" }],
        lg:   ["var(--fs-body-lg)", { lineHeight: "1.7" }],
        xl:   ["1.25rem",           { lineHeight: "1.5", letterSpacing: "-0.005em" }],
        "2xl": ["var(--fs-h3)",      { lineHeight: "1.2", letterSpacing: "-0.014em" }],
        "3xl": ["var(--fs-h2)",      { lineHeight: "1.14", letterSpacing: "-0.018em" }],
        "4xl": ["var(--fs-h1)",      { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "5xl": ["var(--fs-display)", { lineHeight: "1.05", letterSpacing: "-0.022em" }],
        "6xl": ["var(--fs-display-xl)", { lineHeight: "1.02", letterSpacing: "-0.025em" }],
        "7xl": ["var(--fs-display-xl)", { lineHeight: "1.0", letterSpacing: "-0.028em" }],
      },
      letterSpacing: {
        overline: "var(--tracking-overline)",
      },
      maxWidth: {
        measure: "68ch", // comfortable reading line length (~66 chars)
      },
      borderRadius: { sm: "12px", DEFAULT: "20px", lg: "28px", xl: "36px" }
    }
  },
  plugins: []
};
export default config;
