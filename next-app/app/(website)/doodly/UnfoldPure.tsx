"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import bottle from "@/public/products/milk-bottle.png";
import { FadeIn, Stagger, StaggerItem, Float } from "@/components/motion/Motion";
import { BRAND_STORY_SECTIONS } from "@/config/brand-story";
import type { BrandStory } from "@/config/brand-story";

interface ProductCard { slug: string; name: string; emoji: string; description: string; image: string; available: boolean; href: string }

const SECTIONS = BRAND_STORY_SECTIONS;

/* extra line-icons (currentColor) used by the market + connect panels */
const ICON: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flask: '<path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-9V3"/><path d="M7.5 14h9"/>',
  pin: '<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z"/><circle cx="12" cy="11" r="2.2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12Z"/>',
  phone: '<path d="M5 4h3l1.5 5-2 1.5a11 11 0 0 0 5 5l1.5-2 5 1.5V20a2 2 0 0 1-2 2 16 16 0 0 1-16-16 2 2 0 0 1 2-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/>',
};
function Ico({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden dangerouslySetInnerHTML={{ __html: ICON[name] || "" }} />;
}

export function UnfoldPure({ story, products, qrSvg }: { story: BrandStory; products: ProductCard[]; qrSvg: string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // scrollspy: highlight the section nearest the viewport centre + sync the hash
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) {
          setActive(vis.target.id);
          if (`#${vis.target.id}` !== window.location.hash) history.replaceState(null, "", `#${vis.target.id}`);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const go = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [reduce]);

  // deep-link: honour an incoming #hash on load
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (id && SECTIONS.some((s) => s.id === id)) setTimeout(() => go(id), 80);
  }, [go]);

  return (
    <div className="relative bg-milk">
      {/* ---------- desktop sticky side navigation ---------- */}
      <nav aria-label="Story sections" className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
        <ul className="space-y-1">
          {SECTIONS.map((s, i) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={on ? "true" : undefined}
                  onClick={(e) => { e.preventDefault(); go(s.id); }}
                  className="group flex items-center gap-3 py-1.5">
                  <span className={`grid h-7 w-7 place-items-center rounded-full border text-xs font-bold transition-all ${on ? "border-leaf bg-leaf text-white scale-110" : "border-mint-soft bg-white text-ink-3 group-hover:border-leaf"}`}>{i + 1}</span>
                  <span className={`text-sm font-semibold transition-all ${on ? "text-forest" : "text-ink-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"}`}>{s.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ---------- mobile / tablet floating progress nav ---------- */}
      <nav aria-label="Story progress" className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:hidden">
        <div className="flex items-center gap-1.5 rounded-full border border-mint-soft bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => go(s.id)} aria-label={`Go to ${s.label}`} aria-current={active === s.id ? "true" : undefined}
              className={`h-2.5 rounded-full transition-all ${active === s.id ? "w-6 bg-leaf" : "w-2.5 bg-mint-soft"}`} />
          ))}
          <span className="ml-1.5 text-xs font-bold text-forest">{SECTIONS.find((s) => s.id === active)?.label}</span>
        </div>
      </nav>

      <Hero story={story} reduce={!!reduce} onStart={() => go(SECTIONS[1].id)} />

      <main>
        <HookPanel story={story} />
        <MarketPanel story={story} />
        <WhyPanel story={story} />
        <ProductsPanel story={story} products={products} />
        <TrustPanel story={story} />
        <ConnectPanel story={story} qrSvg={qrSvg} />
      </main>
    </div>
  );
}

/* ================= Hero ================= */

function Hero({ story, reduce, onStart }: { story: BrandStory; reduce: boolean; onStart: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBottle = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 80]);
  const yGlow = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);

  return (
    <section ref={ref} className="relative flex min-h-[92vh] items-center overflow-hidden bg-gradient-to-b from-[#FFF6E9] via-[#FCEFE0] to-milk">
      {/* sunrise gradient orbs */}
      <motion.div style={{ y: yGlow }} aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gold-soft/70 blur-3xl" />
      <motion.div style={{ y: yGlow }} aria-hidden className="pointer-events-none absolute -right-24 top-32 h-80 w-80 rounded-full bg-mint/40 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-[1100px] items-center gap-10 px-5 py-20 md:grid-cols-[1.15fr_0.85fr]">
        <motion.div style={{ opacity }}>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white/70 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-gold backdrop-blur">
            ✦ {story.hero.eyebrow}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 font-display text-[clamp(3rem,9vw,6.5rem)] font-bold leading-[0.95] tracking-tight text-forest">
            {story.hero.title}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-6 font-display text-2xl text-ink-2 md:text-3xl">{story.hero.lead}</motion.p>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.26 }}
            className="mt-3 max-w-md text-lg text-ink-3">{story.hero.sub}</motion.p>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.34 }} className="mt-9 flex flex-wrap gap-3">
            <button onClick={onStart} className="rounded-full bg-leaf px-7 py-3.5 font-semibold text-white shadow-lg shadow-leaf/30 transition-transform hover:-translate-y-0.5">Begin the story ↓</button>
            <Link href="/subscriptions" className="rounded-full border border-mint bg-white px-7 py-3.5 font-semibold text-forest transition hover:border-leaf">Order Now</Link>
          </motion.div>
        </motion.div>

        <motion.div style={{ y: yBottle }} className="relative hidden md:block">
          <div aria-hidden className="absolute inset-0 m-auto h-64 w-64 rounded-full bg-white/60 blur-2xl" />
          <Float distance={12} duration={5}>
            <Image src={bottle} alt="DOODLY A2 buffalo milk in a glass bottle" placeholder="blur" priority sizes="320px" className="relative mx-auto h-[22rem] w-auto drop-shadow-2xl" />
          </Float>
        </motion.div>
      </div>

      {/* soft milk-wave */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden leading-none" aria-hidden>
        {!reduce && (
          <motion.svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="h-20 w-[200%] md:h-28"
            animate={{ x: ["0%", "-50%"] }} transition={{ duration: 16, repeat: Infinity, ease: "linear" }}>
            <path d="M0 60 C 180 20 360 100 720 60 S 1260 20 1440 60 L1440 120 L0 120 Z" fill="#FBFCFA" opacity="0.7" />
            <path d="M0 80 C 220 40 420 110 720 80 S 1300 50 1440 80 L1440 120 L0 120 Z" fill="#FBFCFA" />
          </motion.svg>
        )}
        {reduce && <div className="h-12 bg-milk" />}
      </div>
    </section>
  );
}

/* ================= reusable panel shell ================= */

function Panel({ id, children, className = "" }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 py-24 md:py-32 ${className}`}>
      <div className="mx-auto w-full max-w-[860px]">{children}</div>
    </section>
  );
}
function Kicker({ n, label }: { n: number; label: string }) {
  return <p className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-leaf-600"><span className="grid h-5 w-5 place-items-center rounded-full bg-leaf text-[10px] text-white">{n}</span>{label}</p>;
}

/* ================= Panel 1 — Hook ================= */
function HookPanel({ story }: { story: BrandStory }) {
  return (
    <Panel id="hook" className="text-center">
      <FadeIn>
        <h2 className="font-display text-[clamp(2.5rem,8vw,5.5rem)] font-bold leading-none tracking-tight text-forest">{story.hook.title}</h2>
        {story.hook.lines.map((l) => (
          <p key={l} className="mt-6 font-display text-2xl text-ink-2 md:text-3xl">{l}</p>
        ))}
      </FadeIn>
    </Panel>
  );
}

/* ================= Panel 2 — Market Reality ================= */
function MarketPanel({ story }: { story: BrandStory }) {
  return (
    <Panel id="market-reality" className="bg-gradient-to-b from-white to-milk">
      <FadeIn><Kicker n={2} label="Market Reality" /><h2 className="font-display text-3xl text-forest md:text-4xl">{story.market.heading}</h2></FadeIn>
      <Stagger className="mt-10 grid gap-4 sm:grid-cols-3">
        {story.market.problems.map((p) => (
          <StaggerItem key={p.text}>
            <div className="group h-full rounded-3xl border border-mint-soft bg-white/70 p-6 backdrop-blur transition hover:-translate-y-1 hover:shadow-lg">
              <Float distance={6} duration={4}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-soft text-gold"><Ico name={p.icon} size={24} /></span></Float>
              <p className="mt-4 font-display text-lg text-forest">{p.text}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      {/* milk-journey timeline */}
      <FadeIn delay={0.1}>
        <div className="mt-12 flex items-center gap-3 overflow-hidden rounded-3xl border border-mint-soft bg-white/60 px-5 py-4 text-sm text-ink-3">
          <span className="font-semibold text-forest">Farm</span>
          <span className="h-px flex-1 bg-gradient-to-r from-leaf/60 to-mint-soft" />
          <span>days of storage</span>
          <span className="h-px flex-1 bg-gradient-to-r from-mint-soft to-gold/60" />
          <span className="font-semibold text-gold">Shelf</span>
        </div>
      </FadeIn>
      <FadeIn delay={0.15}>
        <div className="mt-10 text-center">
          {story.market.punch.map((l, i) => (
            <p key={l} className={`font-display text-2xl md:text-3xl ${i === story.market.punch.length - 1 ? "mt-1 text-leaf-600" : "text-ink-2"}`}>{l}</p>
          ))}
        </div>
      </FadeIn>
    </Panel>
  );
}

/* ================= Panel 3 — Why DOODLY ================= */
function WhyPanel({ story }: { story: BrandStory }) {
  return (
    <Panel id="why-doodly">
      <FadeIn><Kicker n={3} label="Why DOODLY" /><h2 className="font-display text-3xl text-forest md:text-4xl">{story.why.heading}</h2></FadeIn>
      <Stagger className="mt-8 grid gap-3 sm:grid-cols-2">
        {story.why.points.map((pt) => (
          <StaggerItem key={pt}>
            <div className="flex items-center gap-3 rounded-2xl border border-mint-soft bg-white px-5 py-4">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf text-white"><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4 12 5 5L20 6" /></svg></span>
              <p className="font-semibold text-forest">{pt}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      <FadeIn delay={0.1}><p className="mt-8 text-center font-display text-2xl text-ink-2">{story.why.tagline.join(" ")}</p></FadeIn>

      {/* farm-to-home journey */}
      <Stagger className="mt-12 grid gap-3 md:grid-cols-5">
        {story.why.journey.map((step, i) => (
          <StaggerItem key={step.title}>
            <div className="relative h-full rounded-3xl border border-mint-soft bg-gradient-to-b from-mint-soft/60 to-white p-5 text-center">
              <Float distance={7} duration={4 + i * 0.3}><div className="text-4xl">{step.emoji}</div></Float>
              <p className="mt-3 font-display text-base text-forest">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{step.note}</p>
              {i < story.why.journey.length - 1 && <span aria-hidden className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-leaf md:block">→</span>}
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </Panel>
  );
}

/* ================= Panel 4 — Products ================= */
function ProductsPanel({ story, products }: { story: BrandStory; products: ProductCard[] }) {
  return (
    <Panel id="products" className="bg-gradient-to-b from-milk to-white">
      <FadeIn><Kicker n={4} label="Our Products" /><h2 className="font-display text-3xl text-forest md:text-4xl">{story.products.heading}</h2><p className="mt-2 text-ink-3">{story.products.sub}</p></FadeIn>
      <Stagger className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
        {products.map((p) => (
          <StaggerItem key={p.slug}>
            <Link href={p.href} aria-label={`${p.name}${p.available ? "" : " — coming soon"}`}
              className="group relative block h-full overflow-hidden rounded-3xl border border-mint-soft bg-white p-5 text-center transition-all duration-300 hover:-translate-y-1.5 hover:border-leaf hover:shadow-xl">
              {!p.available && <span className="absolute right-3 top-3 rounded-full bg-gold-soft px-2.5 py-1 text-[10px] font-bold text-gold">Coming soon</span>}
              <div className="relative grid place-items-center rounded-2xl bg-gradient-to-b from-mint-soft/60 to-white py-6">
                {p.image
                  ? <Float distance={8} duration={4.5}><Image src={p.image} alt={p.name} width={120} height={150} className="h-28 w-auto object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-105" /></Float>
                  : <Float distance={8} duration={4.5}><span className="text-6xl transition-transform duration-300 group-hover:scale-110">{p.emoji}</span></Float>}
              </div>
              <p className="mt-4 font-display text-lg text-forest">{p.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{p.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-leaf-600 opacity-0 transition group-hover:opacity-100">{p.available ? "View product" : "Notify me"} <span aria-hidden>→</span></span>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </Panel>
  );
}

/* ================= Panel 5 — Trust ================= */
function TrustPanel({ story }: { story: BrandStory }) {
  return (
    <Panel id="trust" className="bg-gradient-to-b from-[#FFF8EE] to-milk text-center">
      <FadeIn><Kicker n={5} label="Trust" /></FadeIn>
      <Stagger className="space-y-3">
        {story.trust.lines.map((l) => (
          <StaggerItem key={l}><p className="font-display text-2xl text-forest md:text-3xl">{l}</p></StaggerItem>
        ))}
      </Stagger>
      <FadeIn delay={0.15}>
        <div className="mt-8 text-ink-2">
          {story.trust.close.map((l) => <p key={l} className="font-display text-xl md:text-2xl">{l}</p>)}
        </div>
        <div className="mt-8 flex justify-center gap-4 text-5xl" aria-hidden>
          <Float distance={6} duration={4}><span>🧒</span></Float>
          <Float distance={6} duration={4.6}><span>👩</span></Float>
          <Float distance={6} duration={5.2}><span>👴</span></Float>
        </div>
      </FadeIn>
    </Panel>
  );
}

/* ================= Panel 6 — Connect ================= */
function ConnectPanel({ story, qrSvg }: { story: BrandStory; qrSvg: string }) {
  return (
    <Panel id="connect">
      <FadeIn className="text-center">
        <Kicker n={6} label="Scan & Connect" />
        {story.connect.punch.map((l, i) => (
          <p key={l} className={`font-display text-2xl md:text-3xl ${i === story.connect.punch.length - 1 ? "text-leaf-600" : "text-forest"}`}>{l}</p>
        ))}
      </FadeIn>

      <div className="mt-12 grid items-center gap-8 md:grid-cols-[auto_1fr]">
        {/* QR */}
        <FadeIn>
          <div className="mx-auto w-fit rounded-3xl border border-mint-soft bg-white p-5 text-center shadow-sm">
            <div className="h-44 w-44" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="mt-3 text-xs font-semibold text-ink-3">Scan to open this story</p>
          </div>
        </FadeIn>
        {/* channels */}
        <Stagger className="grid gap-3 sm:grid-cols-2">
          {story.connect.channels.map((c) => {
            const inner = (
              <div className="flex items-center gap-3 rounded-2xl border border-mint-soft bg-white px-4 py-3 transition hover:border-leaf">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint-soft text-leaf-600"><Ico name={c.icon} /></span>
                <div className="min-w-0"><p className="text-xs text-ink-3">{c.label}</p><p className="truncate font-semibold text-forest">{c.value}</p></div>
              </div>
            );
            return (
              <StaggerItem key={c.label}>
                {c.href
                  ? <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="block">{inner}</a>
                  : inner}
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>

      {/* CTAs */}
      <FadeIn delay={0.1}>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {story.connect.ctas.map((cta) => (
            <Link key={cta.label} href={cta.href}
              className={cta.kind === "primary"
                ? "rounded-full bg-leaf px-7 py-3.5 font-semibold text-white shadow-lg shadow-leaf/30 transition-transform hover:-translate-y-0.5"
                : "rounded-full border border-mint bg-white px-7 py-3.5 font-semibold text-forest transition hover:border-leaf"}>
              {cta.label}
            </Link>
          ))}
        </div>
      </FadeIn>
    </Panel>
  );
}
