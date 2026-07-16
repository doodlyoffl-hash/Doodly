import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { Stats } from "@/components/site/Sections";
import { FadeIn } from "@/components/motion/Motion";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "About DOODLY",
  description: "DOODLY is a Vijayawada-born dairy brand delivering pure A2 buffalo milk in glass bottles — a short, transparent supply chain from local farms to your door.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  ["Honesty", "No preservatives, no added water, no adulteration. What you taste is exactly what the buffalo gave."],
  ["Freshness", "Collected at dusk, chilled to 4°C, driven through the night, delivered within about 12 hours. Never warehoused."],
  ["Transparency", "You know the farm your milk came from. Short supply chain, real names, real families."],
  ["Sustainability", "Returnable glass bottles, zero single-use plastic, and fair pay for local farmers."],
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Our story"
        title="Milk the way it used to be."
        sub={`${SITE.description}`}
      />
      <section className="mx-auto max-w-3xl px-5 py-16">
        <FadeIn>
          <p className="text-lg leading-relaxed text-ink-2">
            DOODLY began with a simple frustration: packet milk in {SITE.city} never tasted like the milk we grew up with.
            So we went back to the source — partnering directly with local farmers who raise healthy desi buffaloes, and
            building a cold chain fast enough to get their morning milk to your door before breakfast.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">
            No middlemen diluting it. No preservatives extending it. No plastic touching it. Just pure A2 buffalo milk,
            bottled in glass and delivered daily — the way it used to be.
          </p>
        </FadeIn>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {VALUES.map(([h, p]) => (
            <FadeIn key={h}>
              <div className="h-full rounded-[24px] border border-mint-soft bg-white p-6">
                <h2 className="font-display text-xl font-semibold text-forest">{h}</h2>
                <p className="mt-2 leading-relaxed text-ink-2">{p}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>
      <Stats />
      <section className="px-5 py-16 text-center">
        <Link href="/subscriptions" className="inline-block rounded-full bg-leaf px-8 py-3.5 font-semibold text-white transition hover:-translate-y-0.5">
          Taste the difference
        </Link>
      </section>
    </>
  );
}
