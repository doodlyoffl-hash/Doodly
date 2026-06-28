/* =============================================================
   DOODLY — Global search index (single source). Built from the
   catalogue, help-center FAQs and the page map, so new modules
   (blogs, recipes, loyalty, franchise…) are indexed by simply
   adding entries here — no engine or UI change required.
   ============================================================= */
import type { SearchItem } from "@/lib/search/engine";
import { products, variants, plans } from "./catalogue";
import { HELP_FAQS } from "./help-center";

const PRODUCT_SYNS: Record<string, string[]> = {
  milk: ["a2", "buffalo", "doodh", "dairy"],
  curd: ["yogurt", "dahi", "yoghurt", "pot curd"],
  paneer: ["cottage cheese", "malai"],
  ghee: ["clarified butter", "bilona"],
  kova: ["palkova", "khoa", "khoya", "sweet"],
};

const productItems: SearchItem[] = products.map((p) => ({
  id: `product-${p.slug}`, type: "product", title: p.name, subtitle: p.description,
  href: `/products/${p.slug}`, icon: p.emoji, category: "Products", image: p.image || undefined,
  keywords: [p.slug, "dairy", "product", ...(PRODUCT_SYNS[p.slug] ?? [])],
  action: { label: p.status === "AVAILABLE" ? "Order Now" : "Notify me", href: p.status === "AVAILABLE" ? "/subscriptions" : `/products/${p.slug}` },
}));

const VARIANT_KW: Record<string, string[]> = {
  v300: ["trial", "sample", "starter", "300ml", "300 ml", "taste"],
  v500: ["daily", "500ml", "500 ml", "bottle"],
  v1000: ["family", "1000ml", "1 litre", "litre", "large"],
};
const variantItems: SearchItem[] = variants.map((v) => ({
  id: `variant-${v.id}`, type: "variant", title: `${v.label} ${v.sub}`, subtitle: "A2 Buffalo Milk",
  href: "/products/milk", icon: "🍼", category: "Products",
  keywords: ["milk", "bottle", "size", ...(VARIANT_KW[v.id] ?? [])],
  action: { label: "Choose size", href: "/products/milk" },
}));

const planItems: SearchItem[] = plans.map((p) => ({
  id: `plan-${p.slug}`, type: "plan", title: p.name,
  subtitle: p.discountBps ? `Save ${(p.discountBps / 100).toFixed(0)}%` : "Pay as you go",
  href: "/subscriptions", icon: "📅", category: "Subscriptions",
  keywords: [p.slug, "plan", "subscription", `${p.days} day`, p.discountBps ? "save discount" : "single"],
  action: { label: "View plans", href: "/subscriptions" },
}));

const pageItems: SearchItem[] = [
  { id: "page-home", type: "page", title: "Home", href: "/", icon: "🏠", category: "Pages", keywords: ["homepage", "start"] },
  { id: "page-products", type: "page", title: "All Products", href: "/products", icon: "🥛", category: "Pages", keywords: ["shop", "catalogue", "buy"] },
  { id: "page-subscriptions", type: "page", title: "Subscriptions", href: "/subscriptions", icon: "📅", category: "Pages", keywords: ["plans", "subscribe", "pricing"] },
  { id: "page-about", type: "page", title: "About Us", href: "/about", icon: "ℹ️", category: "Pages", keywords: ["company", "story", "who"] },
  { id: "page-farmers", type: "page", title: "Our Farmers", href: "/farmers", icon: "🧑‍🌾", category: "Pages", keywords: ["farms", "source", "dairy"] },
  { id: "page-quality", type: "page", title: "Quality & Safety", href: "/quality", icon: "🔬", category: "Pages", keywords: ["testing", "purity", "fssai"] },
  { id: "page-delivery", type: "page", title: "Delivery", href: "/delivery", icon: "🚚", category: "Pages", keywords: ["shipping", "areas", "timing", "pincode"] },
  { id: "page-bulk", type: "page", title: "Bulk Orders (B2B)", href: "/bulk-orders", icon: "🏢", category: "Pages", keywords: ["business", "wholesale", "hotel", "restaurant", "cafe", "b2b"] },
  { id: "page-bottle-return", type: "page", title: "Bottle Returns", href: "/bottle-return", icon: "♻️", category: "Pages", keywords: ["glass", "deposit", "empties", "recycle"] },
  { id: "page-doodly", type: "page", title: "Our Story — Unfold Pure", href: "/doodly", icon: "✦", category: "Pages", keywords: ["brand", "story", "unfold pure"] },
  { id: "page-help", type: "page", title: "Help Center", href: "/help", icon: "❓", category: "Pages", keywords: ["faq", "support", "questions"] },
  { id: "page-contact", type: "page", title: "Contact", href: "/contact", icon: "📞", category: "Pages", keywords: ["support", "call", "email", "whatsapp", "phone"] },
  { id: "page-blog", type: "page", title: "Blog", href: "/blog", icon: "📝", category: "Pages", keywords: ["articles", "news"] },
  { id: "page-privacy", type: "page", title: "Privacy Policy", href: "/privacy", icon: "📄", category: "Pages", keywords: ["policy", "data", "gdpr"] },
  { id: "page-terms", type: "page", title: "Terms & Conditions", href: "/terms", icon: "📄", category: "Pages", keywords: ["policy", "legal", "terms"] },
  { id: "page-refund", type: "page", title: "Refund Policy", href: "/refund", icon: "📄", category: "Pages", keywords: ["policy", "refund", "money back", "cancel"] },
  { id: "page-shipping", type: "page", title: "Shipping Policy", href: "/shipping", icon: "📄", category: "Pages", keywords: ["policy", "delivery", "shipping"] },
];

const featureItems: SearchItem[] = [
  { id: "feat-orders", type: "feature", title: "My Orders", href: "/account/orders", icon: "📦", category: "Customer", scopes: ["customer"], keywords: ["order", "history", "purchases"], action: { label: "View orders", href: "/account/orders" } },
  { id: "feat-subscription", type: "feature", title: "My Subscription", href: "/account/subscription", icon: "📅", category: "Customer", scopes: ["customer"], keywords: ["plan", "pause", "skip", "resume", "cancel"], action: { label: "Manage", href: "/account/subscription" } },
  { id: "feat-tracking", type: "feature", title: "Delivery Tracking", href: "/account/tracking", icon: "🚚", category: "Customer", scopes: ["customer"], keywords: ["track", "live", "where", "delivery", "status"], action: { label: "Track", href: "/account/tracking" } },
  { id: "feat-wallet", type: "feature", title: "Wallet", href: "/account/wallet", icon: "💰", category: "Customer", scopes: ["customer"], keywords: ["cashback", "credit", "balance", "money", "reward"], action: { label: "Open Wallet", href: "/account/wallet" } },
  { id: "feat-bottles", type: "feature", title: "Bottle Tracking", href: "/account/bottles", icon: "♻️", category: "Customer", scopes: ["customer"], keywords: ["glass", "return", "deposit", "empties"], action: { label: "View bottles", href: "/account/bottles" } },
  { id: "feat-invoices", type: "feature", title: "Invoices", href: "/account/invoices", icon: "🧾", category: "Customer", scopes: ["customer"], keywords: ["bill", "gst", "receipt", "download"] },
  { id: "feat-calendar", type: "feature", title: "Delivery Calendar", href: "/account/calendar", icon: "🗓️", category: "Customer", scopes: ["customer"], keywords: ["schedule", "upcoming", "dates"] },
  { id: "feat-profile", type: "feature", title: "Profile", href: "/account/profile", icon: "👤", category: "Customer", scopes: ["customer"], keywords: ["account", "details", "phone", "email", "name"] },
  { id: "feat-settings", type: "feature", title: "Settings", href: "/account/settings", icon: "⚙️", category: "Customer", scopes: ["customer"], keywords: ["preferences", "notifications", "password"] },
  { id: "feat-referrals", type: "feature", title: "Referrals", href: "/account/referrals", icon: "🎁", category: "Customer", scopes: ["customer"], keywords: ["refer", "invite", "friend", "reward", "share"], action: { label: "Invite friends", href: "/account/referrals" } },
  { id: "feat-dashboard", type: "feature", title: "My Dashboard", href: "/account/dashboard", icon: "📊", category: "Customer", scopes: ["customer"], keywords: ["account", "overview", "home"] },
];

const actionItems: SearchItem[] = [
  { id: "act-order", type: "action", title: "Order Now", href: "/subscriptions", icon: "🛒", category: "Quick Actions", keywords: ["buy", "subscribe", "start"] },
  { id: "act-trial", type: "action", title: "Order the ₹200 Trial Pack", href: "/products/milk", icon: "🍼", category: "Quick Actions", keywords: ["trial", "sample", "300ml", "starter"] },
  { id: "act-track", type: "action", title: "Track my delivery", href: "/account/tracking", icon: "🚚", category: "Quick Actions", scopes: ["customer"], keywords: ["track", "where", "status"] },
  { id: "act-wallet", type: "action", title: "Open my Wallet", href: "/account/wallet", icon: "💰", category: "Quick Actions", scopes: ["customer"], keywords: ["cashback", "balance"] },
  { id: "act-support", type: "action", title: "Contact Support", href: "/contact", icon: "💬", category: "Quick Actions", keywords: ["help", "whatsapp", "call", "email"] },
  { id: "act-help", type: "action", title: "Browse Help & FAQs", href: "/help", icon: "❓", category: "Quick Actions", keywords: ["faq", "questions", "guide"] },
];

const faqItems: SearchItem[] = HELP_FAQS.map((f) => ({
  id: `faq-${f.id}`, type: "faq", title: f.question, subtitle: f.answer.length > 90 ? f.answer.slice(0, 88) + "…" : f.answer,
  href: `/help?q=${encodeURIComponent(f.question)}#cat-${f.category}`, icon: "❓", category: "Help & FAQs",
  keywords: f.keywords, action: { label: "Read answer", href: `/help?q=${encodeURIComponent(f.question)}#cat-${f.category}` },
}));

const adminItems: SearchItem[] = [
  { id: "admin-dashboard", type: "admin", title: "Admin Dashboard", href: "/admin/dashboard", icon: "📊", category: "Admin", scopes: ["admin"], keywords: ["overview", "home"] },
  { id: "admin-orders", type: "admin", title: "Orders", href: "/admin/orders", icon: "📦", category: "Admin", scopes: ["admin"], keywords: ["sales", "manage orders"] },
  { id: "admin-bulk", type: "admin", title: "Bulk Orders", href: "/admin/bulk-orders", icon: "🏢", category: "Admin", scopes: ["admin"], keywords: ["b2b enquiries", "wholesale"] },
  { id: "admin-b2b", type: "admin", title: "B2B Order Management", href: "/admin/b2b", icon: "🏢", category: "Admin", scopes: ["admin"], keywords: ["business", "wholesale", "hotel", "restaurant"] },
  { id: "admin-subscriptions", type: "admin", title: "Subscriptions", href: "/admin/subscriptions", icon: "📅", category: "Admin", scopes: ["admin"], keywords: ["plans", "recurring"] },
  { id: "admin-customers", type: "admin", title: "Customers", href: "/admin/customers", icon: "👥", category: "Admin", scopes: ["admin"], keywords: ["users", "members"] },
  { id: "admin-payments", type: "admin", title: "Payments", href: "/admin/payments", icon: "💳", category: "Admin", scopes: ["admin"], keywords: ["transactions", "razorpay"] },
  { id: "admin-expenses", type: "admin", title: "Daily Expenses", href: "/admin/expenses", icon: "🧾", category: "Admin", scopes: ["admin"], keywords: ["finance", "expense", "spending"] },
  { id: "admin-products", type: "admin", title: "Products", href: "/admin/products", icon: "🥛", category: "Admin", scopes: ["admin"], keywords: ["catalogue", "inventory"] },
  { id: "admin-inventory", type: "admin", title: "Inventory", href: "/admin/inventory", icon: "📦", category: "Admin", scopes: ["admin"], keywords: ["stock", "warehouse"] },
  { id: "admin-deliveries", type: "admin", title: "Delivery Management", href: "/admin/deliveries", icon: "🚚", category: "Admin", scopes: ["admin"], keywords: ["routes", "executives"] },
  { id: "admin-drivers", type: "admin", title: "Drivers", href: "/admin/drivers", icon: "🧑‍✈️", category: "Admin", scopes: ["admin"], keywords: ["delivery executives", "riders"] },
  { id: "admin-farmers", type: "admin", title: "Farmers", href: "/admin/farmers", icon: "🧑‍🌾", category: "Admin", scopes: ["admin"], keywords: ["suppliers", "procurement"] },
  { id: "admin-reports", type: "admin", title: "Reports", href: "/admin/reports", icon: "📈", category: "Admin", scopes: ["admin"], keywords: ["analytics", "insights"] },
  { id: "admin-help", type: "admin", title: "Help Center CMS", href: "/admin/help-center", icon: "❓", category: "Admin", scopes: ["admin"], keywords: ["faq", "knowledge base"] },
  { id: "admin-brand-story", type: "admin", title: "Brand Story CMS", href: "/admin/brand-story", icon: "✦", category: "Admin", scopes: ["admin"], keywords: ["unfold pure", "qr"] },
  { id: "admin-search", type: "admin", title: "Search Insights", href: "/admin/search", icon: "🔎", category: "Admin", scopes: ["admin"], keywords: ["trending", "analytics", "keywords"] },
];

/** The full static index. Dynamic results (orders, specific records) are merged
   in from the /api/search endpoint at query time. */
export const SEARCH_INDEX: SearchItem[] = [
  ...productItems, ...variantItems, ...planItems,
  ...featureItems, ...actionItems, ...pageItems, ...faqItems, ...adminItems,
];

/** Default trending searches (admin-manageable via the DB; this is the seed). */
export const TRENDING_DEFAULTS = [
  "A2 Buffalo Milk", "Trial Pack", "30-Day Morning Ritual", "Delivery Tracking", "Wallet", "Bottle Return",
] as const;
