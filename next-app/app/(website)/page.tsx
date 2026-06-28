import type { Metadata } from "next";
import { Hero } from "@/components/site/Hero";
import { Benefits, HowItWorks, Stats, FarmerStory, CtaBand } from "@/components/site/Sections";
import { TrustMarquee } from "@/components/site/TrustMarquee";
import { BulkCta } from "@/components/bulk/BulkCta";
import { Testimonials } from "@/components/site/Testimonials";
import { Faq } from "@/components/site/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { localBusinessLd, faqLd, productLd } from "@/lib/seo";
import { products, variants } from "@/config/catalogue";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "Fresh A2 Buffalo Milk Delivery in Vijayawada",
  description:
    "DOODLY delivers pure A2 buffalo milk in glass bottles across Vijayawada & Tadepalli — farm fresh, chilled instantly, no preservatives, at your door by 7 AM. Subscribe & save.",
  alternates: { canonical: "/" },
  keywords: [
    "fresh milk delivery Vijayawada", "A2 buffalo milk", "glass bottle milk", "milk subscription Vijayawada",
    "farm fresh milk Andhra Pradesh", "buffalo milk delivery", "DOODLY milk",
  ],
  openGraph: { title: "DOODLY — Fresh A2 Buffalo Milk Delivery in Vijayawada", description: SITE.description, url: "/" },
};

export default function HomePage() {
  const milk = products.find((p) => p.slug === "milk")!;
  const v500 = variants.find((v) => v.id === "v500");

  return (
    <>
      {/* structured data for rich results + local SEO */}
      <JsonLd data={[
        localBusinessLd(),
        faqLd(),
        productLd({ name: milk.name, description: milk.description, slug: milk.slug, image: milk.image, available: milk.status === "AVAILABLE", pricePaise: v500?.dailyPaise }),
      ]} />

      <Hero />
      <TrustMarquee />
      <Benefits />
      <HowItWorks />
      <Stats />
      <FarmerStory />
      <BulkCta />
      <Testimonials />
      <Faq />
      <CtaBand />
    </>
  );
}
