import type { MetadataRoute } from "next";

// Falls back to doodly.in, not a placeholder we don't own. See config/site.ts.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.doodly.in";

// Mirrors next.config.mjs — this deployment duplicates doodly.in and is kept out of
// the index via an X-Robots-Tag: noindex header until that's resolved.
const indexable = process.env.INDEXABLE === "true";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Stays "allow" even while noindexed, and that is deliberate. The noindex
        // lives in an X-Robots-Tag header, and a crawler can only obey a directive
        // it is allowed to fetch. Disallowing here would leave already-indexed URLs
        // stranded in search with no way for Google to learn they should go.
        allow: "/",
        // keep authenticated / internal surfaces and APIs out of the index
        disallow: ["/account/", "/admin/", "/driver/", "/delivery/", "/api/", "/login", "/reset-password"],
      },
    ],
    // Only advertise a sitemap when this deployment is actually meant to be indexed.
    // Otherwise we'd be pointing crawlers at doodly.in/sitemap.xml from a site that
    // is telling them not to index it — and doodly.in has no sitemap.xml yet anyway.
    ...(indexable ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
    host: SITE_URL,
  };
}
