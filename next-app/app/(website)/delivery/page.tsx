import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { HowItWorks } from "@/components/site/Sections";
import { FadeIn } from "@/components/motion/Motion";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "Delivery & Coverage",
  description: "DOODLY delivers fresh A2 buffalo milk across Vijayawada & Tadepalli — at your door by 7 AM, every morning. Free delivery, pause or skip anytime.",
  alternates: { canonical: "/delivery" },
};

const FACTS = [
  ["By 7 AM, daily", "Your milk is delivered fresh every morning before breakfast — within 12 hours of milking."],
  ["Free in our zones", "No delivery charge across serviceable areas in Vijayawada and Tadepalli."],
  ["Pause &amp; skip", "Going away? Pause, skip a day or reschedule in one tap — you're never locked in."],
  ["Glass bottle pickup", "We collect your empty bottles on the next delivery and refund the deposit on cancellation."],
];

export default function DeliveryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Fresh at your door by 7 AM."
        sub={`We deliver across ${SITE.city} and Tadepalli, every single morning, before the city wakes up.`}
      />
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <div className="grid gap-5 sm:grid-cols-2">
          {FACTS.map(([h, p]) => (
            <FadeIn key={h}>
              <div className="h-full rounded-[24px] border border-mint-soft bg-white p-6">
                <h2 className="font-display text-xl font-semibold text-forest">{h}</h2>
                <p className="mt-2 leading-relaxed text-ink-2">{p}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>
      <HowItWorks />
      <section className="px-5 py-16 text-center">
        <p className="text-ink-2">Not sure if we deliver to you?</p>
        <Link href="/contact" className="mt-4 inline-block rounded-full bg-leaf px-8 py-3.5 font-semibold text-white transition hover:-translate-y-0.5">
          Check your area
        </Link>
      </section>
    </>
  );
}
