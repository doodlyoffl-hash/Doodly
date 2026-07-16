/* =============================================================
   DOODLY — Help Center + Onboarding content (single source).
   The /help page, the first-time tour and the contextual tooltips
   all render from here, so copy can be edited with no component
   change. FAQs are also seeded into the DB (HelpArticle) for the
   Admin CMS, where they become fully editable without a deploy.
   ============================================================= */
import { SITE } from "./site";

export const HELP_CATEGORIES = [
  { id: "getting-started", label: "Getting Started", icon: "🚀" },
  { id: "products", label: "Products", icon: "🥛" },
  { id: "delivery", label: "Delivery", icon: "🚚" },
  { id: "subscription", label: "Subscription", icon: "📅" },
  { id: "wallet", label: "Wallet", icon: "💰" },
  { id: "payments", label: "Payments", icon: "💳" },
  { id: "bottle-returns", label: "Bottle Returns", icon: "♻️" },
  { id: "b2b", label: "B2B Orders", icon: "🏢" },
  { id: "account", label: "Account", icon: "👤" },
] as const;
export type HelpCategoryId = (typeof HELP_CATEGORIES)[number]["id"];

export interface HelpFaq { id: string; category: HelpCategoryId; question: string; answer: string; keywords: string[] }

export const HELP_FAQS: HelpFaq[] = [
  // ---- Getting Started ----
  { id: "what-is-doodly", category: "getting-started", question: "What is DOODLY?", keywords: ["about", "brand", "a2", "milk"],
    answer: "DOODLY delivers A2 buffalo milk from a small circle of family-run farms around Pamuru, Andhra Pradesh — collected at dusk, chilled to 4°C, driven through the night, bottled in glass, and at your door within about 12 hours. No preservatives, nothing added. Just honest milk." },
  { id: "first-order", category: "getting-started", question: "How do I place my first order?", keywords: ["order", "start", "trial", "buy"],
    answer: "Pick a product, choose a bottle size, select a plan (or the ₹200 trial pack), choose your delivery start date, add your address, and check out. Your first delivery arrives the next morning by 7 AM if you order before the 8 PM cut-off." },
  { id: "how-subscriptions-work", category: "getting-started", question: "How do subscriptions work?", keywords: ["subscription", "plan", "daily", "recurring"],
    answer: "A subscription delivers fresh milk to your door every morning for the plan duration you choose. You can pause, skip a day, change the start date, or cancel anytime from your dashboard — no questions asked." },
  { id: "what-products", category: "getting-started", question: "What products do you offer?", keywords: ["products", "milk", "curd", "paneer", "ghee", "palkova"],
    answer: "A2 Buffalo Milk is live now. Buffalo Pot Curd, Malai Paneer, Buffalo Ghee and Palkova are launching soon — all made from the same single-source A2 milk." },

  // ---- Products ----
  { id: "what-is-a2", category: "products", question: "What is A2 Buffalo Milk?", keywords: ["a2", "beta casein", "protein"],
    answer: "A1 and A2 are two forms of the protein in milk, differing by a single amino acid. Buffalo milk is naturally the A2 type — so DOODLY is A2 buffalo milk. We don't make health claims about it; we'd rather you judge it on how fresh it tastes." },
  { id: "why-glass", category: "products", question: "Why glass bottles?", keywords: ["glass", "bottle", "plastic", "packaging"],
    answer: "Glass keeps milk fresh with zero taste transfer and no plastic. Our bottles are sterilised and returnable with a small refundable deposit — premium and planet-friendly." },
  { id: "preservatives", category: "products", question: "Are there any preservatives?", keywords: ["preservatives", "adulteration", "pure", "chemicals"],
    answer: "Never. No preservatives, no added water, no adulteration. Every batch is quality-checked for fat, SNF and purity before it's bottled." },
  { id: "how-fresh", category: "products", question: "How fresh is the milk?", keywords: ["fresh", "12 hours", "chilled", "collection"],
    answer: "Milk is collected at dusk near Pamuru, snap-chilled to 4°C, driven through the night, and bottled before dawn — delivered within about 12 hours, at your door by 7 AM." },

  // ---- Delivery ----
  { id: "delivery-timings", category: "delivery", question: "What are the delivery timings?", keywords: ["timing", "slot", "morning", "7 am"],
    answer: "Deliveries arrive in the early morning, typically between 6:00 AM and 8:00 AM, so fresh milk is waiting for you when you wake up." },
  { id: "cutoff", category: "delivery", question: "What is the 8 PM cut-off rule?", keywords: ["cut-off", "cutoff", "8 pm", "order by", "next day"],
    answer: "Order before 8:00 PM and your first delivery can start the very next morning. Order after 8:00 PM and it starts the day after, since the morning's milk is already being planned. The cut-off is shown live on the calendar when you pick a start date." },
  { id: "delivery-tracking", category: "delivery", question: "How do I track my delivery?", keywords: ["track", "live", "status", "banner"],
    answer: "A live status banner appears at the top of the site and your dashboard once you have an active order — showing Confirmed, Out for Delivery, Arriving and Delivered in real time. The Tracking page shows the live route and your delivery executive." },
  { id: "serviceable-areas", category: "delivery", question: "Which areas do you deliver to?", keywords: ["serviceable", "pincode", "area", "zone", "vijayawada", "tadepalli"],
    answer: "We currently deliver across Vijayawada and Tadepalli. Enter your pincode at checkout to instantly confirm serviceability — if we're not there yet, you can join the waitlist for your area." },
  { id: "missed-delivery", category: "delivery", question: "What happens if I miss a delivery?", keywords: ["missed", "failed", "not home", "reschedule"],
    answer: "If a delivery can't be completed, our executive marks it and we reach out to reschedule. You're never charged for milk you didn't receive — subscription days simply shift forward." },

  // ---- Subscription ----
  { id: "change-start-date", category: "subscription", question: "How do I change my start date?", keywords: ["start date", "change", "reschedule", "calendar"],
    answer: "Open My Subscription, choose Change start date, and pick a new date on the calendar (respecting the 8 PM cut-off). The schedule and end date update automatically." },
  { id: "pause-subscription", category: "subscription", question: "How do I pause my subscription?", keywords: ["pause", "vacation", "hold", "stop temporarily"],
    answer: "Tap Pause on My Subscription — for a single day, a date range, or Vacation Mode. Deliveries stop for that window and your plan extends so you never lose paid days." },
  { id: "resume-subscription", category: "subscription", question: "How do I resume a paused subscription?", keywords: ["resume", "restart", "unpause"],
    answer: "Tap Resume on My Subscription and deliveries restart from the next available morning, respecting the 8 PM cut-off." },
  { id: "skip-delivery", category: "subscription", question: "How do I skip a single delivery?", keywords: ["skip", "one day", "emergency"],
    answer: "Use Skip next delivery on My Subscription to skip just tomorrow. Your plan extends by that day, so nothing is wasted." },
  { id: "cancel-subscription", category: "subscription", question: "How do I cancel my subscription?", keywords: ["cancel", "stop", "end"],
    answer: "You can cancel anytime in one tap from My Subscription — no questions asked. Any unused balance is handled per our refund policy." },

  // ---- Wallet ----
  { id: "trial-cashback", category: "wallet", question: "How does trial cashback work?", keywords: ["trial", "cashback", "200", "wallet", "reward"],
    answer: "When you complete the ₹200 trial pack and upgrade to a 30-day or 90-day plan, ₹200 cashback is credited to your DOODLY Wallet — automatically, once per customer." },
  { id: "wallet-usage", category: "wallet", question: "How do I use my wallet balance?", keywords: ["wallet", "use", "redeem", "balance", "checkout"],
    answer: "Your wallet balance is applied at checkout — it's deducted from your order total before payment. You're always in control of how much to use." },
  { id: "wallet-expiry", category: "wallet", question: "Does wallet credit expire?", keywords: ["expiry", "expire", "validity", "wallet"],
    answer: "Cashback credits may carry an expiry shown next to each entry in your wallet. Regular top-ups and refunds don't expire. Check the wallet page for the exact dates on each credit." },
  { id: "wallet-refunds", category: "wallet", question: "How are refunds handled in the wallet?", keywords: ["refund", "wallet", "credit", "money back"],
    answer: "Eligible refunds are credited to your DOODLY Wallet for instant reuse on your next order, with a full transaction history you can view anytime." },

  // ---- Payments ----
  { id: "payment-methods", category: "payments", question: "Which payment methods are supported?", keywords: ["payment", "upi", "card", "netbanking", "cod", "methods"],
    answer: "We support UPI, credit/debit cards, net banking, wallets and Cash on Delivery, processed securely through Razorpay. Your card details never touch our servers." },
  { id: "autopay", category: "payments", question: "How does Auto Pay work?", keywords: ["auto pay", "autopay", "renewal", "mandate", "recurring"],
    answer: "Auto Pay sets up a secure mandate so your subscription renews automatically — no manual payment each cycle. We notify you before every renewal, retry gently if a charge fails, and you can disable it anytime." },
  { id: "failed-payments", category: "payments", question: "What happens if a payment fails?", keywords: ["failed", "payment", "retry", "declined"],
    answer: "We retry the payment a few times over the following hours and notify you. Your deliveries continue during the grace window; if it keeps failing, Auto Pay pauses so nothing is charged unexpectedly." },
  { id: "gst-invoices", category: "payments", question: "Do you provide GST invoices?", keywords: ["gst", "invoice", "bill", "tax"],
    answer: "Yes — a GST invoice is generated for every order and is downloadable from your Invoices page. Business customers can add GST details for proper tax invoices." },

  // ---- Bottle Returns ----
  { id: "bottle-deposit", category: "bottle-returns", question: "What is the bottle deposit?", keywords: ["deposit", "bottle", "120", "refundable"],
    answer: "Each glass bottle carries a small refundable deposit (₹120). It's fully returned to your wallet when you hand the empty bottles back — it simply keeps our glass in circulation." },
  { id: "return-process", category: "bottle-returns", question: "How does the bottle return process work?", keywords: ["return", "bottle", "empty", "collect"],
    answer: "Leave your rinsed empty bottles out at your next delivery — our executive collects them and your bottle ledger updates automatically. You can track bottles out, returned and deposit balance on the Bottle Tracking page." },
  { id: "broken-bottles", category: "bottle-returns", question: "What if a bottle breaks?", keywords: ["broken", "damaged", "bottle", "deposit"],
    answer: "Accidents happen — let us know and we'll adjust your bottle ledger fairly. The deposit simply covers the cost of keeping glass in circulation." },

  // ---- B2B ----
  { id: "b2b-bulk", category: "b2b", question: "Can I order in bulk for my business?", keywords: ["b2b", "bulk", "business", "hotel", "restaurant", "cafe"],
    answer: "Yes — DOODLY serves hotels, restaurants, cafés, bakeries, caterers and more with dedicated B2B ordering, business pricing and flexible delivery timings. Reach out via Bulk Orders or Contact to get set up." },
  { id: "b2b-business-id", category: "b2b", question: "What is a Business ID?", keywords: ["business id", "b2b", "account", "doo-b2b"],
    answer: "Every registered business gets a unique Business ID (e.g. DOO-B2B-000001) that ties together your orders, pricing, invoices and outstanding balance for fast reordering and clean accounting." },
  { id: "b2b-scheduling", category: "b2b", question: "How does B2B delivery scheduling work?", keywords: ["b2b", "schedule", "delivery", "timing", "bulk"],
    answer: "B2B deliveries aren't limited to fixed slots — you choose the delivery date and preferred time that suits your kitchen or counter, from early-morning to evening, including custom timings." },

  // ---- Account ----
  { id: "reset-password", category: "account", question: "How do I reset my password?", keywords: ["password", "reset", "forgot", "login"],
    answer: "On the login screen, tap Forgot password and we'll send a reset code to your registered mobile or email. You can also log in with a one-time OTP." },
  { id: "update-profile", category: "account", question: "How do I update my profile?", keywords: ["profile", "update", "edit", "details"],
    answer: "Open Profile in your dashboard to update your name, email and delivery preferences. Changes save instantly." },
  { id: "change-phone", category: "account", question: "How do I change my phone number?", keywords: ["phone", "mobile", "number", "change"],
    answer: "Update your phone number from Profile → it's verified with an OTP to keep your account secure, since your mobile is your primary login." },
  { id: "delete-account", category: "account", question: "How do I delete my account?", keywords: ["delete", "account", "remove", "close"],
    answer: "Contact our support team to request account deletion. We'll confirm, settle any wallet balance or bottle deposit per policy, and remove your data." },
];

// ---- Quick-help cards (scroll to a category) ----
export const HELP_QUICK_CARDS = [
  { icon: "📦", label: "Place an Order", category: "getting-started" },
  { icon: "🚚", label: "Track Delivery", category: "delivery" },
  { icon: "💳", label: "Payments", category: "payments" },
  { icon: "🥛", label: "Subscription Guide", category: "subscription" },
  { icon: "♻️", label: "Bottle Returns", category: "bottle-returns" },
  { icon: "🏢", label: "Bulk Orders (B2B)", category: "b2b" },
] as const;

// ---- First-time guided tour (welcome + 8 steps + success) ----
export const TOUR_STEPS = [
  { n: 1, emoji: "🥛", title: "Choose your product", body: "Start with our single-source A2 Buffalo Milk, or explore the dairy products launching soon — curd, paneer, ghee and palkova.", href: "/products", cta: "Browse products" },
  { n: 2, emoji: "🍼", title: "Choose your bottle", body: "300 ml is the perfect trial taste, 500 ml is the daily bottle, and 1000 ml is the family favourite. Pick what fits your home.", href: "/products/milk", cta: "See sizes" },
  { n: 3, emoji: "📅", title: "Choose your plan", body: "Single Pour, 7-Day Fresh Start, 30-Day Morning Ritual or 90-Day Nourish Plan — longer plans save more, shown live as you choose.", href: "/subscriptions", cta: "Compare plans" },
  { n: 4, emoji: "⏰", title: "Pick your start date", body: "Order before 8 PM to start tomorrow morning; after 8 PM, it begins the day after. The calendar shows exactly when your first bottle arrives.", href: "/subscriptions", cta: "Learn the cut-off" },
  { n: 5, emoji: "📍", title: "Add your address", body: "Drop a pin on the map and we'll confirm your pincode is serviceable, then assign you to the right delivery zone.", href: "/delivery", cta: "Check your area" },
  { n: 6, emoji: "💳", title: "Checkout your way", body: "Pay by UPI, card, net banking or wallet. Turn on Auto Pay for hands-free renewals, and use your DOODLY Wallet balance for instant savings.", href: "/subscriptions", cta: "How payments work" },
  { n: 7, emoji: "🚚", title: "Track your delivery", body: "Follow your order live — Confirmed, Out for Delivery, Arriving and Delivered — and return empty glass bottles for a deposit refund.", href: "/account/tracking", cta: "See tracking" },
  { n: 8, emoji: "🎉", title: "Enjoy DOODLY", body: "You're ready to experience fresh dairy, delivered the way it should be. Welcome to the family!", href: "/subscriptions", cta: "Get started" },
] as const;

// ---- Contextual tooltips (ⓘ beside complex features) ----
export const HELP_TIPS: Record<string, { title: string; body: string; href?: string }> = {
  wallet: { title: "What is the DOODLY Wallet?", body: "Your in-app balance for cashback, referrals and refunds. It's applied automatically at checkout to lower your total.", href: "/help#wallet" },
  subscription: { title: "How does this plan work?", body: "Fresh milk every morning for the plan's duration. Pause, skip or cancel anytime — longer plans save more.", href: "/help#subscription" },
  bottleReturn: { title: "How do bottle returns work?", body: "Leave rinsed empties out at your next delivery; we collect them and refund the ₹120/bottle deposit to your wallet.", href: "/help#bottle-returns" },
  autopay: { title: "What happens during renewal?", body: "Auto Pay renews your plan via a secure mandate. We notify you first, retry gently on failure, and you can disable it anytime.", href: "/help#payments" },
  trialPack: { title: "What is the trial pack?", body: "A ₹200, 3-day taste of 300 ml A2 milk. Complete it and upgrade to a 30/90-day plan to earn ₹200 wallet cashback.", href: "/help#wallet" },
  cutoff: { title: "What is the 8 PM cut-off?", body: "Order before 8 PM to start tomorrow morning; after 8 PM, delivery begins the day after.", href: "/help#delivery" },
};

// ---- Video guides (future-ready placeholders; admin uploads later) ----
export const HELP_VIDEOS = [
  { id: "place-order", title: "How to place an order", topic: "getting-started" },
  { id: "subscriptions", title: "How subscriptions work", topic: "subscription" },
  { id: "bottle-returns", title: "How bottle returns work", topic: "bottle-returns" },
  { id: "autopay", title: "How Auto Pay works", topic: "payments" },
] as const;

export const HELP_SUPPORT = {
  whatsapp: `https://wa.me/${SITE.whatsapp}`,
  phone: SITE.phone,
  email: SITE.email,
  hours: SITE.hours,
};
