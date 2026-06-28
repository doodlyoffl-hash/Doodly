import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqLd, breadcrumbLd } from "@/lib/seo";
import { SITE } from "@/config/site";
import { listPublishedFaqs } from "@/lib/help/service";
import { HelpCenter } from "./HelpCenter";

// ISR: fast/static, regenerated every 10 min so CMS edits surface without deploy.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Help Center — FAQs & Support",
  description:
    "Everything about DOODLY: getting started, A2 buffalo milk, delivery & the 8 PM cut-off, subscriptions, wallet & trial cashback, payments & Auto Pay, glass-bottle returns, and B2B orders. Search answers instantly.",
  alternates: { canonical: "/help" },
  keywords: ["DOODLY help", "milk delivery FAQ", "subscription help", "wallet cashback", "bottle return", "Auto Pay", "Vijayawada milk support"],
  openGraph: { title: "DOODLY Help Center — FAQs & Support", description: "Search answers about subscriptions, delivery, wallet, payments, bottle returns and B2B.", url: "/help", type: "website" },
};

export default async function HelpPage() {
  const faqs = await listPublishedFaqs();
  return (
    <>
      <JsonLd data={[
        faqLd(faqs.slice(0, 20).map((f) => ({ q: f.question, a: f.answer }))),
        breadcrumbLd([{ name: "Home", path: "/" }, { name: "Help Center", path: "/help" }]),
        { "@context": "https://schema.org", "@type": "WebPage", name: "DOODLY Help Center", url: `${SITE.url}/help` },
      ]} />
      <HelpCenter faqs={faqs.map((f) => ({ id: f.id, category: String(f.category), question: f.question, answer: f.answer, keywords: f.keywords, sortOrder: f.sortOrder ?? 0 }))} />
    </>
  );
}
