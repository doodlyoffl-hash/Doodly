import { FadeIn } from "@/components/motion/Motion";

/* Reusable inner-page hero band (server component → client FadeIn). */
export function PageHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <section className="border-b border-mint-soft bg-gradient-to-b from-[#F1F8F3] to-milk">
      <FadeIn className="mx-auto max-w-3xl px-5 py-16 text-center md:py-20">
        <p className="t-overline text-leaf-600">{eyebrow}</p>
        <h1 className="t-display mt-3.5">{title}</h1>
        {sub && <p className="t-body-lg mx-auto mt-4 max-w-2xl text-ink-2">{sub}</p>}
      </FadeIn>
    </section>
  );
}
