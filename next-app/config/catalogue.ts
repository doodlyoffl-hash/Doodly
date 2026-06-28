/* =============================================================
   DOODLY — Catalogue seed (mirror of the static assets/js/data.js)
   This is the single seed source; each object maps 1:1 to a
   Product / Variant / Plan row. `prisma/seed.ts` reads from here.
   Flip a product's status to "AVAILABLE" to launch it — no code change.
   ============================================================= */

export type ProductStatus = "AVAILABLE" | "COMING_SOON";

// `image` is the transparent bottle cut-out; `gallery` feeds the detail page.
// Edit these paths from the Admin CMS — no code change needed.
export const products = [
  { slug: "milk",   name: "A2 Buffalo Milk", status: "AVAILABLE"   as ProductStatus, emoji: "🥛", description: "Single-source, chilled within minutes, bottled in glass.",
    image: "/products/milk-bottle.png",
    gallery: ["/products/milk-bottle.png", "/products/milk-lifestyle.jpg", "/products/milk-splash.jpg", "/products/farm-story.jpg"] },
  { slug: "curd",   name: "Buffalo Pot Curd", status: "COMING_SOON" as ProductStatus, emoji: "🍶", description: "Set thick from the same A2 milk. Cultured overnight.", image: "", gallery: [] as string[] },
  { slug: "paneer", name: "Malai Paneer",     status: "COMING_SOON" as ProductStatus, emoji: "🧀", description: "Soft, fresh-pressed paneer. Nothing added.", image: "", gallery: [] as string[] },
  { slug: "kova",   name: "Palkova",          status: "COMING_SOON" as ProductStatus, emoji: "🍮", description: "Slow-reduced milk khoa for festive sweets.", image: "", gallery: [] as string[] },
  { slug: "ghee",   name: "Buffalo Ghee",     status: "COMING_SOON" as ProductStatus, emoji: "🫙", description: "Bilona-method ghee, golden and aromatic.", image: "", gallery: [] as string[] },
];

// Money in PAISE (₹200 = 20000, ₹70 = 7000, ₹130 = 13000)
export const variants = [
  { id: "v300",  productSlug: "milk", label: "300 ml",  sub: "Sample Pack",  ml: 300,  type: "TRIAL"        as const, fixedPaise: 20000, fixedDays: 3 },
  { id: "v500",  productSlug: "milk", label: "500 ml",  sub: "Daily Bottle", ml: 500,  type: "SUBSCRIPTION" as const, dailyPaise: 7000 },
  { id: "v1000", productSlug: "milk", label: "1000 ml", sub: "Family Bottle",ml: 1000, type: "SUBSCRIPTION" as const, dailyPaise: 13000, featured: true },
];

export const plans = [
  { slug: "single", name: "Single Pour",          days: 1,  discountBps: 0,    tag: null },
  { slug: "p7",     name: "7-Day Fresh Start",     days: 7,  discountBps: 500,  tag: null },
  { slug: "p30",    name: "30-Day Morning Ritual", days: 30, discountBps: 800,  tag: "Most popular" },
  { slug: "p90",    name: "90-Day Nourish Plan",   days: 90, discountBps: 1000, tag: "Best value" },
];

export const bottleDepositPaise = 12000; // ₹120 refundable per bottle
