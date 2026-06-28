import Image from "next/image";
import Link from "next/link";
import { FadeIn, Stagger, StaggerItem, ScaleIn } from "@/components/motion/Motion";
import { Counter } from "@/components/motion/Reveal";
import { Icon } from "./icons";
import { BENEFITS, STEPS, STATS, FARMERS, TRUST_BADGES } from "@/config/site";

const SectionHead = ({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) => (
  <FadeIn className="mx-auto max-w-2xl text-center">
    <p className="t-overline text-leaf-600">{eyebrow}</p>
    <h2 className="t-h1 mt-3.5">{title}</h2>
    {sub && <p className="t-body-lg mx-auto mt-4 max-w-xl text-ink-2">{sub}</p>}
  </FadeIn>
);

/* ---------- Trust strip ---------- */
export function TrustStrip() {
  return (
    <section aria-label="Trust certifications" className="border-y border-mint-soft bg-white">
      <FadeIn className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-7">
        {TRUST_BADGES.map((b) => (
          <span key={b} className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-mint-soft text-leaf-600"><Icon name="check" size={12} /></span>{b}
          </span>
        ))}
      </FadeIn>
    </section>
  );
}

/* ---------- Benefits ---------- */
export function Benefits() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-24">
      <SectionHead eyebrow="Why DOODLY" title="Milk worth waking up for." sub="Six reasons families across Vijayawada switch to DOODLY — and never go back to packet milk." />
      <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <StaggerItem key={b.title}>
            <div className="group h-full rounded-[28px] border border-mint-soft bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-mint hover:shadow-xl hover:shadow-leaf/10">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-mint-soft text-leaf-600 transition-colors group-hover:bg-leaf group-hover:text-white">
                <Icon name={b.icon} size={26} />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-forest">{b.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-2">{b.text}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

/* ---------- How it works (timeline) ---------- */
export function HowItWorks() {
  return (
    <section className="bg-[#F6FAF6]">
      <div className="mx-auto max-w-[1200px] px-5 py-24">
        <SectionHead eyebrow="How it works" title="From the farm to your door in hours." sub="Five steps, every single morning, before the city wakes up." />
        <div className="relative mt-16">
          {/* connecting line (desktop) */}
          <div aria-hidden className="absolute left-0 right-0 top-7 hidden h-0.5 bg-gradient-to-r from-mint via-leaf to-mint lg:block" />
          <Stagger className="grid gap-10 lg:grid-cols-5">
            {STEPS.map((s) => (
              <StaggerItem key={s.n} className="relative text-center">
                <div className="relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-full border-2 border-leaf bg-white text-leaf-600 shadow-sm">
                  <Icon name={s.icon} size={24} />
                </div>
                <div className="mt-4 font-display text-sm font-bold text-leaf-600">{s.n}</div>
                <h3 className="mt-1 font-display text-lg font-semibold text-forest">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-ink-2">{s.text}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

/* ---------- Stats (count-up on a premium dark band) ---------- */
export function Stats() {
  return (
    <section className="bg-gradient-to-br from-forest to-[#0a2e22] text-white">
      <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <ScaleIn key={s.label} className="text-center">
            <div className="font-display text-5xl font-bold text-mint">
              <Counter to={s.value} suffix={s.suffix} decimals={"decimals" in s ? (s as { decimals: number }).decimals : 0} />
            </div>
            <div className="mt-2 text-sm font-medium text-white/80">{s.label}</div>
          </ScaleIn>
        ))}
      </div>
    </section>
  );
}

/* ---------- Farmer story ---------- */
export function FarmerStory() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-24">
      <SectionHead eyebrow="Our farmers" title="Real farms. Real families. Real milk." sub="A short, transparent supply chain — you know the farm your milk came from." />
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        {FARMERS.map((f, i) => (
          <FadeIn key={f.name} direction={i === 0 ? "right" : "left"}>
            <article className="group flex h-full flex-col overflow-hidden rounded-[32px] border border-mint-soft bg-white shadow-sm transition-shadow hover:shadow-xl">
              <div className="relative h-60 overflow-hidden">
                <Image src={f.img} alt={`${f.name}, DOODLY partner farmers at ${f.farm}`} fill sizes="(max-width: 768px) 100vw, 580px"
                  className="object-cover transition-transform duration-700 group-hover:scale-105" />
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-forest backdrop-blur">{f.years} yrs with DOODLY</span>
              </div>
              <div className="flex flex-1 flex-col p-7">
                <p className="font-display text-xl leading-relaxed text-forest">&ldquo;{f.quote}&rdquo;</p>
                <div className="mt-auto pt-5">
                  <p className="font-semibold text-forest">{f.name}</p>
                  <p className="text-sm text-ink-3">{f.farm}</p>
                </div>
              </div>
            </article>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

/* ---------- CTA band ---------- */
export function CtaBand() {
  return (
    <section className="px-5 py-20">
      <FadeIn className="mx-auto max-w-[1100px] overflow-hidden rounded-[40px] bg-gradient-to-br from-leaf to-forest px-8 py-16 text-center text-white shadow-2xl">
        <h2 className="mx-auto max-w-2xl font-display text-4xl font-semibold leading-tight md:text-5xl">Wake up to fresh milk tomorrow.</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">Start with a ₹200 trial pack — three mornings of DOODLY before you subscribe.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/subscriptions" className="rounded-full bg-white px-8 py-3.5 font-semibold text-forest transition hover:-translate-y-0.5">Start your trial</Link>
          <Link href="/products" className="rounded-full border border-white/40 px-8 py-3.5 font-semibold text-white transition hover:bg-white/10">Explore products</Link>
        </div>
        <p className="mt-6 text-sm text-white/70">Refundable glass-bottle deposit · Pause or cancel anytime</p>
      </FadeIn>
    </section>
  );
}
