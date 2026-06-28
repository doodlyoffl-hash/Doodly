import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { FadeIn } from "@/components/motion/Motion";
import { BulkCta } from "@/components/bulk/BulkCta";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with DOODLY — WhatsApp, call or email us about fresh A2 buffalo milk delivery in Vijayawada & Tadepalli.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const wa = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hi DOODLY! I'd like to know more about milk delivery.")}`;
  const mail = `mailto:${SITE.email}?subject=${encodeURIComponent(SITE.emailSubject)}`;
  const channels = [
    { h: "WhatsApp", v: "Chat with us", href: wa, note: "Fastest — usually replies in minutes", label: "Chat with DOODLY on WhatsApp" },
    { h: "Call", v: SITE.phone, href: `tel:${SITE.phone.replace(/\s/g, "")}`, note: SITE.hours, label: "Call DOODLY Customer Support" },
    { h: "Email", v: SITE.email, href: mail, note: "For orders, billing & support", label: "Email DOODLY Support" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="We'd love to hear from you."
        sub={`Questions about delivery, subscriptions or a bottle? Reach out — we're based in ${SITE.city}, ${SITE.region}.`}
      />
      <section className="mx-auto max-w-[1000px] px-5 py-16">
        <div className="grid gap-5 sm:grid-cols-3">
          {channels.map((c) => (
            <FadeIn key={c.h}>
              <a
                href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                aria-label={c.label}
                className="block h-full rounded-[24px] border border-mint-soft bg-white p-7 text-center transition-all hover:-translate-y-1 hover:border-leaf hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-leaf-600">{c.h}</p>
                <p className="mt-3 font-display text-xl font-semibold text-forest">{c.v}</p>
                <p className="mt-2 text-sm text-ink-3">{c.note}</p>
              </a>
            </FadeIn>
          ))}
        </div>
        <FadeIn className="mt-10 rounded-[28px] bg-[#F6FAF6] p-8 text-center">
          <h2 className="font-display text-2xl font-semibold text-forest">Serving Vijayawada &amp; Tadepalli</h2>
          <p className="mt-2 text-ink-2">Enter your pincode at checkout to confirm we deliver to your street. New areas are added every month.</p>
        </FadeIn>
      </section>
      <BulkCta />
    </>
  );
}
