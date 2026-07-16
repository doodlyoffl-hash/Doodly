import type { MetadataRoute } from "next";
import { products } from "@/config/catalogue";

// Falls back to doodly.in rather than a placeholder we don't own (see config/site.ts).
//
// ⚠️ This sitemap describes THIS deployment's routes, which are extensionless
// (/products, /about). doodly.in serves .html paths (/products.html) — they are not
// interchangeable, so with the fallback in play these URLs would not resolve there.
// It doesn't currently matter: this deployment is noindex and app/robots.ts no longer
// advertises a sitemap while that's true. But if you set INDEXABLE=true, also set
// NEXT_PUBLIC_SITE_URL to THIS deployment's own domain — not doodly.in — or you'll be
// handing Google a list of 404s.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.doodly.in";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes = [
    { path: "/", priority: 1.0, freq: "daily" as const },
    { path: "/doodly", priority: 0.8, freq: "monthly" as const },
    { path: "/products", priority: 0.9, freq: "daily" as const },
    { path: "/subscriptions", priority: 0.9, freq: "weekly" as const },
    { path: "/bulk-orders", priority: 0.8, freq: "monthly" as const },
    { path: "/about", priority: 0.6, freq: "monthly" as const },
    { path: "/farmers", priority: 0.6, freq: "monthly" as const },
    { path: "/quality", priority: 0.5, freq: "monthly" as const },
    { path: "/delivery", priority: 0.5, freq: "monthly" as const },
    { path: "/bottle-return", priority: 0.4, freq: "monthly" as const },
    { path: "/blog", priority: 0.6, freq: "weekly" as const },
    { path: "/contact", priority: 0.5, freq: "yearly" as const },
    { path: "/help", priority: 0.7, freq: "monthly" as const },
    { path: "/privacy", priority: 0.3, freq: "yearly" as const },
    { path: "/terms", priority: 0.3, freq: "yearly" as const },
    { path: "/shipping", priority: 0.3, freq: "yearly" as const },
    { path: "/refund", priority: 0.3, freq: "yearly" as const },
  ];

  const productRoutes = products.map((p) => ({
    path: `/products/${p.slug}`,
    priority: p.status === "AVAILABLE" ? 0.8 : 0.4,
    freq: "weekly" as const,
  }));

  return [...staticRoutes, ...productRoutes].map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
