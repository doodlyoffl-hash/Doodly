/* =============================================================
   DOODLY — "UNFOLD PURE." brand-story content (single source).
   The /doodly page renders entirely from this config, so copy,
   links, CTAs and the QR destination can be edited here (or via the
   DB override in the Admin → Brand Story CMS) with NO page-code
   changes. Product slugs resolve against config/catalogue.ts so
   launch state ("Coming soon") stays automatic.
   ============================================================= */
import { SITE } from "./site";

export const BRAND_STORY_SECTIONS = [
  { id: "hook", label: "Hook" },
  { id: "market-reality", label: "Market Reality" },
  { id: "why-doodly", label: "Why DOODLY" },
  { id: "products", label: "Our Products" },
  { id: "trust", label: "Trust" },
  { id: "connect", label: "Scan & Connect" },
] as const;
export type BrandStorySectionId = (typeof BRAND_STORY_SECTIONS)[number]["id"];

export const BRAND_STORY = {
  // canonical route + the QR destination printed on packaging
  path: "/doodly",
  qrDestination: `${SITE.url}/doodly`,

  hero: {
    eyebrow: "The DOODLY packaging insert, reborn digitally",
    title: "UNFOLD PURE.",
    lead: "This is not just dairy.",
    sub: "A story of honesty, freshness, and trust.",
  },

  hook: {
    title: "UNFOLD PURE.",
    lines: ["This is not just dairy."],
  },

  market: {
    heading: "The reality of most dairy today",
    problems: [
      { icon: "clock", text: "Stored too long" },
      { icon: "flask", text: "Treated for shelf life" },
      { icon: "pin", text: "Far from its source" },
    ],
    punch: ["Freshness is promised.", "Purity is compromised."],
  },

  why: {
    heading: "DOODLY DAIRY",
    points: [
      "A2 Buffalo Milk",
      "Farm-fresh within 12 hours",
      "No preservatives.",
      "No processing shortcuts.",
    ],
    tagline: ["Collected at night.", "Delivered by morning."],
    journey: [
      { emoji: "🐃", title: "Healthy Buffaloes", note: "Milked at dusk on farms we know by name." },
      { emoji: "🪣", title: "Milk Collection", note: "Gathered & quality-checked the same night." },
      { emoji: "❄️", title: "4°C Chilling", note: "Snap-chilled within minutes to lock freshness." },
      { emoji: "🍶", title: "Glass Bottling", note: "Filled into sterilised, returnable glass." },
      { emoji: "🌅", title: "Morning Delivery", note: "At your door by 7 AM — within 12 hours." },
    ],
  },

  // each entry maps to a catalogue slug; status (Coming soon) is read live.
  products: {
    heading: "Our Premium Collection",
    sub: "Made from the same single-source A2 milk.",
    slugs: ["milk", "curd", "paneer", "ghee", "kova"],
  },

  trust: {
    lines: [
      "For kids who need strength.",
      "For parents who value honesty.",
      "For grandparents who know real taste.",
    ],
    close: ["DOODLY is dairy you can trust—", "at every age, every day."],
  },

  connect: {
    punch: ["Real dairy doesn't need loud claims.", "It needs integrity."],
    channels: [
      { label: "Website", value: SITE.url.replace(/^https?:\/\//, ""), href: SITE.url, icon: "globe" },
      { label: "WhatsApp", value: "Chat with us", href: `https://wa.me/${SITE.whatsapp}`, icon: "chat" },
      { label: "Customer Care", value: SITE.phone, href: `tel:${SITE.phone.replace(/\s/g, "")}`, icon: "phone" },
      { label: "Email", value: SITE.email, href: `mailto:${SITE.email}`, icon: "mail" },
      { label: "Instagram", value: "@doodlyoffl", href: SITE.social.instagram, icon: "instagram" },
      { label: "Business hours", value: SITE.hours, href: "", icon: "clock" },
    ],
    ctas: [
      { label: "Order Now", href: "/subscriptions", kind: "primary" as const },
      { label: "View Products", href: "/products", kind: "secondary" as const },
      { label: "Subscribe Today", href: "/subscriptions", kind: "secondary" as const },
    ],
  },
} as const;

export type BrandStory = typeof BRAND_STORY;
