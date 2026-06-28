import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { FarmerStory } from "@/components/site/Sections";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Our Farmers",
  description: "Meet the local Vijayawada families behind DOODLY. A short, transparent supply chain — you know the farm your A2 buffalo milk came from.",
  alternates: { canonical: "/farmers" },
};

export default function FarmersPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Our Farmers", path: "/farmers" }])} />
      <PageHeader
        eyebrow="Our farmers"
        title="Real farms. Real families."
        sub="We partner directly with local farmers who raise healthy desi buffaloes — no middlemen, no anonymity, no shortcuts."
      />
      <FarmerStory />
    </>
  );
}
