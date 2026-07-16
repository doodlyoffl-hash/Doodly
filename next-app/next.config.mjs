/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

/* This deployment serves a COMPLETE customer storefront that duplicates doodly.in
   page-for-page, on a different codebase. Two indexable copies of the same content
   compete with each other in search and split whatever authority either one earns,
   so this one stays out of the index until that's resolved one way or the other.

   Deliberately an X-Robots-Tag header, not a robots.txt Disallow: a disallowed URL
   cannot be crawled, so Google never sees the directive and any URL already indexed
   lingers as a bare link. Noindex only works if the crawler is still allowed IN to
   read it — app/robots.ts therefore keeps `allow: "/"` on purpose. Don't "tidy" that
   into a Disallow; it would strand exactly the URLs this is meant to remove.

   Flip with INDEXABLE=true in the Vercel env if this ever becomes the real site. */
const indexable = process.env.INDEXABLE === "true";

/* Content-Security-Policy — pragmatic baseline that allows the third parties
   DOODLY uses (Razorpay, Google Maps, GA4, Clarity, Meta Pixel, Cloudinary,
   Supabase). 'unsafe-inline'/'unsafe-eval' are needed for Next's bootstrap +
   the analytics snippets; tighten to a nonce-based policy once those are wired. */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms https://connect.facebook.net https://maps.googleapis.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://*.clarity.ms https://connect.facebook.net https://www.facebook.com https://maps.googleapis.com https://res.cloudinary.com`,
  `frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://www.google.com`,
  `media-src 'self'`,
  `worker-src 'self' blob:`,
  `frame-ancestors 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.razorpay.com\"), browsing-topics=()" },
  ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,                 // don't leak "X-Powered-By: Next.js"
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,   // 30 days
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],   // tree-shake big libs
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // long-lived immutable cache for hashed build assets
      { source: "/_next/static/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // never cache the service worker — let new deploys take effect immediately
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
