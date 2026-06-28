import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Stagger, StaggerItem } from "@/components/motion/Motion";

export const metadata: Metadata = {
  title: "The DOODLY Journal",
  description: "Stories from the farm, the science of A2 milk, and tips for a fresher kitchen — from the DOODLY team in Vijayawada.",
  alternates: { canonical: "/blog" },
};

const POSTS = [
  { tag: "Nutrition", title: "A2 vs A1 milk: what's the real difference?", excerpt: "Why A2 beta-casein is easier on many tummies — and how to tell what you're actually drinking." },
  { tag: "From the farm", title: "A morning with our Kanuru farmers", excerpt: "5 AM milking, same-day testing, and the short journey from buffalo to bottle." },
  { tag: "Sustainability", title: "Why we chose glass over plastic", excerpt: "The case for returnable bottles — for taste, for health, and for the planet." },
  { tag: "Kitchen", title: "Set the perfect curd at home", excerpt: "A foolproof method using fresh A2 buffalo milk for thick, creamy curd every time." },
];

export default function BlogPage() {
  return (
    <>
      <PageHeader eyebrow="Journal" title="The DOODLY Journal" sub="Stories from the farm, the science of fresh milk, and tips for a healthier kitchen." />
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <Stagger className="grid gap-6 sm:grid-cols-2">
          {POSTS.map((p) => (
            <StaggerItem key={p.title}>
              <article className="h-full rounded-[28px] border border-mint-soft bg-white p-7">
                <span className="rounded-full bg-mint-soft px-3 py-1 text-xs font-bold text-leaf-600">{p.tag}</span>
                <h2 className="mt-4 font-display text-2xl font-semibold leading-snug text-forest">{p.title}</h2>
                <p className="mt-2 leading-relaxed text-ink-2">{p.excerpt}</p>
                <p className="mt-4 text-sm font-semibold text-ink-3">Full article coming soon</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </>
  );
}
