/* =============================================================
   DOODLY — site/brand constants (single source for the storefront)
   Edit here; every premium section + SEO schema reads from this.
   ============================================================= */

export const SITE = {
  name: "DOODLY",
  legalName: "SUBADHAAM MILK DAIRY Pvt. Ltd.",
  tagline: "Fresh A2 Buffalo Milk, delivered daily.",
  // NEXT_PUBLIC_SITE_URL is not set in Vercel, so this fallback is what ships.
  // It was "https://yourdomain.com" — a placeholder we don't own — which meant every
  // page declared <link rel="canonical" href="https://yourdomain.com"> and og:url to
  // match: we were telling Google the real version of our pages lives on a stranger's
  // parked domain, and any shared link previewed as theirs. Pointing the fallback at
  // doodly.in also resolves the duplicate-content split between this deployment and
  // the static site in doodly.in's favour. Still set NEXT_PUBLIC_SITE_URL properly.
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.doodly.in",
  description:
    "A2 buffalo milk from family-run farms around Pamuru — collected at dusk, chilled to 4°C, driven through the night, bottled in glass, and delivered in Vijayawada within about 12 hours. No preservatives, nothing added.",
  city: "Vijayawada",
  region: "Andhra Pradesh",
  country: "IN",
  phone: "+91 91177 99143",
  whatsapp: "919429692738", // digits only, for wa.me
  email: "doodlyoffl@gmail.com",
  emailSubject: "DOODLY Customer Support",
  hours: "Mon–Sat, 8 AM – 8 PM",
  geo: { lat: 16.5062, lng: 80.648 },
  // Single source of truth for social links. Only non-empty URLs are rendered/
  // indexed; future channels stay "" until their official accounts exist.
  social: {
    instagram: "https://www.instagram.com/doodlyoffl?igsh=MWVvZXk3a3JseXJqYw==",
    facebook: "https://www.facebook.com/share/18ioyH5qRY/?mibextid=wwXIfr",
    x: "",
    youtube: "",
    linkedin: "",
  },
} as const;

/* Trust builders (icon = inline svg key in components/site/icons) */
export const TRUST_BADGES = [
  "FSSAI Certified", "100% A2 Buffalo Milk", "Glass Bottles", "Fresh Today",
  "No Preservatives", "Daily Collection", "Local Farmers", "Premium Packaging",
] as const;

export const BENEFITS = [
  { icon: "drop", title: "Farm Fresh", text: "Single-source A2 buffalo milk, collected at dusk from farms we know by name." },
  { icon: "snow", title: "Chilled Immediately", text: "Snap-chilled to 4°C within minutes of collection to lock in freshness." },
  { icon: "drop", title: "A2 by Nature", text: "Buffalo milk is naturally A2 — that's the breed, not a process." },
  { icon: "bottle", title: "Glass Bottles", text: "Returnable, sterilised glass — zero plastic, no taste transfer." },
  { icon: "truck", title: "12-Hour Delivery", text: "From the farm to your doorstep within 12 hours — at your door by 7 AM." },
  { icon: "leaf", title: "Nothing Added", text: "No preservatives, no added water. What we bottle is what was milked." },
] as const;

export const STEPS = [
  { n: "01", title: "Local Farmer", text: "Trusted family farms milk healthy desi buffaloes at dusk.", icon: "farmer" },
  { n: "02", title: "Collection", text: "Milk is collected and quality-checked the same evening.", icon: "can" },
  { n: "03", title: "4°C Chilling", text: "Snap-chilled within minutes to slow bacterial growth.", icon: "snow" },
  { n: "04", title: "Glass Bottling", text: "Filled into sterilised, returnable glass bottles.", icon: "bottle" },
  { n: "05", title: "Delivery", text: "At your door within 12 hours — fresh by 7 AM.", icon: "truck" },
] as const;

export const STATS = [
  { value: 8400, suffix: "+", label: "Families served" },
  { value: 1200, suffix: "+", label: "Bottles delivered daily" },
  { value: 12, suffix: "", label: "Partner farms" },
  { value: 4.9, suffix: "★", label: "Average rating", decimals: 1 },
] as const;

export const FARMERS = [
  { name: "Ravi & Lakshmi", farm: "Kanuru village", years: 12, quote: "We've milked the same way for two generations — DOODLY just gets it to your home, fresh.", img: "/products/farm-story.jpg" },
  { name: "Suresh Reddy", farm: "Gunadala", years: 8, quote: "Healthy buffaloes, no shortcuts. Our milk is tested every single morning.", img: "/products/milk-lifestyle.jpg" },
] as const;

export const TESTIMONIALS = [
  { name: "Ananya R.", role: "Mother of two", rating: 5, text: "The taste is exactly like the milk I grew up with. My kids actually ask for it now." },
  { name: "Karthik V.", role: "Fitness coach", rating: 5, text: "High protein, easy to digest, and the glass bottles feel premium. Best milk in Vijayawada." },
  { name: "Sunita D.", role: "Senior citizen", rating: 5, text: "Delivered by 7 every morning without fail. Fresh, honest and so reliable." },
  { name: "Imran S.", role: "Health-conscious", rating: 5, text: "No preservatives, no adulteration — I can finally trust what I'm drinking." },
] as const;

export const FAQS = [
  { q: "What is A2 buffalo milk?", a: "A1 and A2 are two forms of the protein in milk, differing by a single amino acid. Buffalo milk is naturally the A2 type — so DOODLY is A2 buffalo milk. We don't make health claims about it; we'd rather you judge it on how fresh it tastes." },
  { q: "How fresh is the milk?", a: "Milk is collected at dusk near Pamuru, chilled to 4°C, driven through the night, and bottled before dawn — delivered within about 12 hours, at your door by 7 AM." },
  { q: "Do you deliver in Vijayawada?", a: "Yes — we deliver across Vijayawada and Tadepalli. Enter your pincode at checkout to confirm availability in your area." },
  { q: "Are the glass bottles returnable?", a: "Absolutely. Bottles are sterilised and returnable with a small refundable deposit — zero plastic, no taste transfer." },
  { q: "Can I pause or cancel my subscription?", a: "Anytime, in one tap from your dashboard. Pause for a vacation, skip a day, or cancel — no questions asked." },
  { q: "Is there any adulteration or preservatives?", a: "Never. No preservatives, no added water, no adulteration. Every batch is quality-checked for fat, SNF and purity." },
] as const;
