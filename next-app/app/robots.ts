import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yourdomain.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // keep authenticated / internal surfaces and APIs out of the index
        disallow: ["/account/", "/admin/", "/driver/", "/delivery/", "/api/", "/login", "/reset-password"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
