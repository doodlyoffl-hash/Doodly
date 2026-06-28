import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbLd, organizationLd } from "@/lib/seo";
import { SITE } from "@/config/site";
import { products as catalogue } from "@/config/catalogue";
import { getBrandStory } from "@/lib/brand-story/service";
import { qrToSvg } from "@/lib/qr";
import { UnfoldPure } from "./UnfoldPure";

// ISR: served from cache (fast Lighthouse), regenerated every 10 min so CMS
// edits surface without a deploy. DB reads are failure-tolerant (defaults at build).
export const revalidate = 600;

export const metadata: Metadata = {
  title: "UNFOLD PURE — The DOODLY Brand Story",
  description:
    "Unfold the DOODLY story: single-source A2 buffalo milk, collected at night and delivered by morning. A digital experience of honesty, freshness and trust — no preservatives, no shortcuts.",
  alternates: { canonical: "/doodly" },
  keywords: [
    "DOODLY brand story", "UNFOLD PURE", "A2 buffalo milk story", "farm fresh dairy Vijayawada",
    "honest dairy", "glass bottle milk", "pure milk no preservatives",
  ],
  openGraph: {
    title: "UNFOLD PURE — The DOODLY Brand Story",
    description: "A digital story of honesty, freshness and trust. Single-source A2 buffalo milk, collected at night, delivered by morning.",
    url: "/doodly",
    type: "article",
    images: [{ url: "/products/milk-lifestyle.jpg", width: 1200, height: 630, alt: "DOODLY — UNFOLD PURE" }],
  },
  twitter: { card: "summary_large_image", title: "UNFOLD PURE — The DOODLY Brand Story" },
};

export default async function DoodlyStoryPage() {
  const story = await getBrandStory();

  const products = story.products.slugs
    .map((slug) => catalogue.find((p) => p.slug === slug))
    .filter((p): p is (typeof catalogue)[number] => Boolean(p))
    .map((p) => ({
      slug: p.slug, name: p.name, emoji: p.emoji, description: p.description,
      image: p.image || "", available: p.status === "AVAILABLE", href: `/products/${p.slug}`,
    }));

  const qrSvg = qrToSvg(story.qrDestination, { dark: "#0F3D2E", margin: 3 });

  return (
    <>
      <JsonLd data={[
        breadcrumbLd([{ name: "Home", path: "/" }, { name: "UNFOLD PURE", path: "/doodly" }]),
        organizationLd(),
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "UNFOLD PURE — The DOODLY Brand Story",
          url: `${SITE.url}/doodly`,
          description: "A digital story of honesty, freshness and trust from DOODLY.",
          isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
          primaryImageOfPage: `${SITE.url}/products/milk-lifestyle.jpg`,
        },
      ]} />
      <UnfoldPure story={story} products={products} qrSvg={qrSvg} />
    </>
  );
}
