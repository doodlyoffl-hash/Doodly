import type { Metadata } from "next";
import { PageHeader } from "./PageHeader";
import { SITE } from "@/config/site";

export type LegalSection = { h: string; p: string[] };

/* Shared scaffold for Privacy / Terms / Refund / Shipping pages. */
export function LegalPage({ title, intro, sections, updated = "27 June 2026" }: {
  title: string; intro: string; sections: LegalSection[]; updated?: string;
}) {
  return (
    <>
      <PageHeader eyebrow="Legal" title={title} sub={intro} />
      <article className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm text-ink-3">Last updated: {updated}</p>
        <div className="mt-8 space-y-10">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-2xl font-semibold text-forest">{s.h}</h2>
              {s.p.map((para, i) => (
                <p key={i} className="mt-3 leading-relaxed text-ink-2">{para}</p>
              ))}
            </section>
          ))}
          <p className="border-t border-mint-soft pt-8 text-ink-2">
            Questions? Email <a href={`mailto:${SITE.email}`} className="font-semibold text-leaf-600 underline">{SITE.email}</a> or
            call {SITE.phone}.
          </p>
        </div>
      </article>
    </>
  );
}

export function legalMetadata(title: string, description: string): Metadata {
  const path = "/" + title.toLowerCase().replace(/\s+/g, "-");
  return { title, description, alternates: { canonical: path }, robots: { index: true, follow: true } };
}
