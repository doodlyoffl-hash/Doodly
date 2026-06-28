import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Stagger, StaggerItem } from "@/components/motion/Motion";

export const metadata: Metadata = {
  title: "Glass Bottle Returns",
  description: "How DOODLY's returnable glass-bottle program works — a small refundable deposit, doorstep pickup, sterilised reuse, and zero single-use plastic.",
  alternates: { canonical: "/bottle-return" },
};

const STEPS = [
  ["1 · Small deposit", "You pay a small, fully refundable deposit per glass bottle on your first order."],
  ["2 · Leave them out", "Rinse and leave your empties at the door — we collect them on your next delivery."],
  ["3 · Sterilised reuse", "Bottles are washed and sterilised to food-grade standards before being refilled."],
  ["4 · Deposit refunded", "Cancel anytime and your bottle deposit is refunded in full. Zero plastic, zero waste."],
];

export default function BottleReturnPage() {
  return (
    <>
      <PageHeader
        eyebrow="Glass bottles"
        title="Returnable, refillable, zero plastic."
        sub="Our glass bottles keep your milk pure and the planet cleaner. Here's how the deposit-and-return program works."
      />
      <section className="mx-auto max-w-[1000px] px-5 py-16">
        <Stagger className="grid gap-5 sm:grid-cols-2">
          {STEPS.map(([h, p]) => (
            <StaggerItem key={h}>
              <div className="h-full rounded-[24px] border border-mint-soft bg-white p-7">
                <h2 className="font-display text-xl font-semibold text-forest">{h}</h2>
                <p className="mt-2 leading-relaxed text-ink-2">{p}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-10 rounded-[24px] bg-[#F6FAF6] p-7 text-center text-ink-2">
          Lost or broke a bottle? No problem — the deposit simply covers its replacement. We&apos;ll never charge you for normal wear.
        </p>
      </section>
    </>
  );
}
