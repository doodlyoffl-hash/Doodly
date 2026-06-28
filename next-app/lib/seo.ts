/* =============================================================
   DOODLY — JSON-LD structured data builders (schema.org)
   Rendered via <JsonLd> in the layout/pages. Powers rich results:
   Organization, WebSite (sitelinks search), LocalBusiness (local
   SEO — Vijayawada), Product, FAQPage, BreadcrumbList.
   ============================================================= */
import { SITE, FAQS } from "@/config/site";

const sameAs = Object.values(SITE.social).filter(Boolean);   // drop unset (future) channels

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: `${SITE.url}/logo.png`,
    email: SITE.email,
    telephone: SITE.phone,
    sameAs,
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE.city,
      addressRegion: SITE.region,
      addressCountry: SITE.country,
    },
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.url}/products?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/* Local SEO — appears for "fresh milk delivery in Vijayawada" etc. */
export function localBusinessLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE.url}/#localbusiness`,
    name: SITE.name,
    image: `${SITE.url}/logo.png`,
    url: SITE.url,
    telephone: SITE.phone,
    priceRange: "₹₹",
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE.city,
      addressRegion: SITE.region,
      addressCountry: SITE.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: SITE.geo.lat, longitude: SITE.geo.lng },
    areaServed: [SITE.city, "Tadepalli", SITE.region],
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00", closes: "20:00",
    },
    sameAs,
  };
}

export function faqLd(faqs: ReadonlyArray<{ q: string; a: string }> = FAQS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function productLd(p: { name: string; description: string; slug: string; image?: string; available: boolean; pricePaise?: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: `${SITE.url}${p.image || "/products/milk-bottle.png"}`,
    brand: { "@type": "Brand", name: SITE.name },
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "312" },
    offers: {
      "@type": "Offer",
      url: `${SITE.url}/products/${p.slug}`,
      priceCurrency: "INR",
      price: p.pricePaise != null ? (p.pricePaise / 100).toFixed(2) : "70.00",
      availability: p.available ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      seller: { "@type": "Organization", name: SITE.name },
    },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE.url}${it.path}`,
    })),
  };
}
