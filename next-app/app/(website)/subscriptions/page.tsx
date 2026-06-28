import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion/Motion";
import { variants, plans } from "@/config/catalogue";
import { quote, inr } from "@/lib/pricing";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Milk Subscriptions & Plans",
  description: "Choose your DOODLY plan — daily fresh A2 buffalo milk in glass bottles, from ₹70/day. 7, 30 or 90-day plans with up to 10% off. Pause or cancel anytime.",
  alternates: { canonical: "/subscriptions" },
};

const subVariants = variants.filter((v) => v.type === "SUBSCRIPTION");

export default function SubscriptionsPage() {
  // Show plan pricing against the daily 500 ml bottle as the reference variant.
  const ref = subVariants.find((v) => v.id === "v500") ?? subVariants[0];

  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Subscriptions", path: "/subscriptions" }])} />
      <PageHeader
        eyebrow="Subscriptions"
        title="Pick a plan. Wake up to fresh milk."
        sub="Daily glass-bottle delivery by 7 AM. Longer plans save more — and you can pause, skip or cancel anytime."
      />

      {/* Bottle sizes */}
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <h2 className="text-center font-display text-3xl font-semibold text-forest">Choose your bottle</h2>
        <Stagger className="mt-10 grid gap-5 sm:grid-cols-3">
          {variants.map((v) => {
            const price = v.type === "TRIAL" ? `${inr(v.fixedPaise!)} total` : `${inr(v.dailyPaise!)}/day`;
            return (
              <StaggerItem key={v.id}>
                <div className={`relative h-full rounded-[28px] border bg-white p-7 text-center transition-all hover:-translate-y-1 hover:shadow-xl ${"featured" in v && v.featured ? "border-leaf shadow-lg shadow-leaf/10" : "border-mint-soft"}`}>
                  {"featured" in v && v.featured && <span className="absolute right-5 top-5 rounded-full bg-leaf px-3 py-1 text-xs font-bold text-white">Popular</span>}
                  <div className="font-display text-2xl font-semibold text-forest">{v.label}</div>
                  <div className="mt-1 text-sm text-ink-3">{v.sub}</div>
                  <div className="mt-4 font-display text-3xl font-bold text-leaf-600">{price}</div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* Plans */}
      <section className="bg-[#F6FAF6]">
        <div className="mx-auto max-w-[1100px] px-5 py-16">
          <h2 className="text-center font-display text-3xl font-semibold text-forest">Choose your plan</h2>
          <p className="mt-2 text-center text-ink-2">Prices shown for the {ref.label} daily bottle ({inr(ref.dailyPaise!)}/day).</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-4">
            {plans.map((p) => {
              const isSub = p.days > 1;
              const q = quote({ type: "SUBSCRIPTION", ml: ref.ml, dailyPaise: ref.dailyPaise }, { days: p.days, discountBps: p.discountBps });
              return (
                <FadeIn key={p.slug}>
                  <div className={`relative flex h-full flex-col rounded-[28px] border bg-white p-7 ${p.tag === "Most popular" ? "border-leaf shadow-lg shadow-leaf/10" : "border-mint-soft"}`}>
                    {p.tag && <span className="absolute right-5 top-5 rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">{p.tag}</span>}
                    <h3 className="font-display text-xl font-semibold text-forest">{p.name}</h3>
                    <p className="mt-1 text-sm text-ink-3">{p.days} day{p.days > 1 ? "s" : ""}{p.discountBps > 0 ? ` · ${p.discountBps / 100}% off` : ""}</p>
                    <div className="mt-5 font-display text-3xl font-bold text-forest">{inr(q.totalPaise)}</div>
                    {q.savedPaise > 0 && <p className="mt-1 text-sm font-semibold text-leaf-600">You save {inr(q.savedPaise)}</p>}
                    <Link href="/login" className={`mt-6 rounded-full py-3 text-center font-semibold transition ${p.tag === "Most popular" ? "bg-leaf text-white hover:-translate-y-0.5" : "border border-mint-soft text-forest hover:border-leaf"}`}>
                      {isSub ? "Start this plan" : "Order once"}
                    </Link>
                  </div>
                </FadeIn>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-ink-3">All plans include a refundable glass-bottle deposit. GST included. Free delivery within Vijayawada &amp; Tadepalli.</p>
        </div>
      </section>
    </>
  );
}
