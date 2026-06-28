import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { BulkRequestForm } from "@/components/bulk/BulkRequestForm";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbLd } from "@/lib/seo";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "Bulk Milk Delivery for Weddings, Events & Catering",
  description:
    "Order fresh A2 buffalo milk in bulk for weddings, functions, catering, festivals, hotels & restaurants in Vijayawada. Request a quote — best pricing & delivery options.",
  alternates: { canonical: "/bulk-orders" },
  keywords: [
    "bulk milk delivery", "wedding milk supply", "function milk orders", "catering milk supplier",
    "fresh buffalo milk in bulk", "event milk delivery", "bulk A2 milk Vijayawada",
  ],
  openGraph: {
    title: "Bulk A2 Buffalo Milk — Weddings, Events & Catering | DOODLY",
    description: "Fresh milk in bulk for any occasion. Request a quote and we'll reply with pricing & delivery.",
    url: "/bulk-orders",
  },
};

const serviceLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Bulk A2 Buffalo Milk Supply",
  serviceType: "Bulk milk delivery for events, catering & businesses",
  description:
    "Fresh A2 buffalo milk supplied in bulk for weddings, functions, religious events, catering, hotels, restaurants and festivals across Vijayawada & Tadepalli.",
  provider: { "@type": "Organization", name: SITE.name, url: SITE.url, telephone: SITE.phone },
  areaServed: [SITE.city, "Tadepalli", SITE.region],
  audience: { "@type": "Audience", audienceType: "Weddings, functions, catering, hotels, restaurants, festivals" },
};

export default function BulkOrdersPage() {
  return (
    <>
      <JsonLd data={[serviceLd, breadcrumbLd([{ name: "Home", path: "/" }, { name: "Bulk orders", path: "/bulk-orders" }])]} />
      <PageHeader
        eyebrow="Bulk & events"
        title="Fresh milk in bulk, for any occasion."
        sub="Weddings, functions, catering, festivals, hotels & restaurants — tell us what you need and we'll reply with the best pricing and delivery options. It's an enquiry, not an order, so there's no payment now."
      />
      <section className="px-5 py-14">
        <BulkRequestForm />
      </section>
    </>
  );
}
