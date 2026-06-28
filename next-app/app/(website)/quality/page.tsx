import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Stagger, StaggerItem } from "@/components/motion/Motion";
import { Icon } from "@/components/site/icons";
import { TRUST_BADGES } from "@/config/site";

export const metadata: Metadata = {
  title: "Quality & Safety",
  description: "How DOODLY keeps milk pure and safe — FSSAI certified, lab-tested every morning, snap-chilled to 4°C, bottled in sterilised glass. No preservatives, no adulteration.",
  alternates: { canonical: "/quality" },
};

const CHECKS = [
  ["Tested every morning", "Every batch is checked for fat, SNF, lactometer reading and purity before it leaves the farm."],
  ["Snap-chilled to 4°C", "Milk is cooled within minutes of milking to lock in freshness and stop bacterial growth."],
  ["Sterilised glass", "Returnable bottles are washed and sterilised to food-grade standards — zero plastic, no taste transfer."],
  ["Cold chain to your door", "Insulated transport keeps the milk cold the whole way — delivered within 12 hours, by 7 AM."],
  ["No preservatives", "Nothing added to extend shelf life. If it's not fresh, we don't sell it."],
  ["FSSAI certified", "Licensed and compliant with India's food safety standards, end to end."],
];

export default function QualityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Quality &amp; safety"
        title="Purity you can taste — and verify."
        sub="Every bottle passes through the same uncompromising checks, from the farm at dawn to your doorstep by morning."
      />
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map(([h, p]) => (
            <StaggerItem key={h}>
              <div className="h-full rounded-[28px] border border-mint-soft bg-white p-7">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint-soft text-leaf-600">
                  <Icon name="shield" size={24} />
                </div>
                <h2 className="mt-5 font-display text-lg font-semibold text-forest">{h}</h2>
                <p className="mt-2 leading-relaxed text-ink-2">{p}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="mt-14 flex flex-wrap justify-center gap-3">
          {TRUST_BADGES.map((b) => (
            <span key={b} className="flex items-center gap-2 rounded-full border border-mint-soft bg-white px-4 py-2 text-sm font-semibold text-ink-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-mint-soft text-leaf-600"><Icon name="check" size={12} /></span>{b}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
