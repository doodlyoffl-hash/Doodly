import Link from "next/link";
import { FadeIn } from "@/components/motion/Motion";

const OCCASIONS = ["Weddings", "Functions", "Catering", "Festivals", "Hotels & restaurants"];

/* Homepage / contact banner inviting bulk enquiries. */
export function BulkCta() {
  return (
    <section className="px-5 py-16">
      <FadeIn className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[40px] border border-mint-soft bg-gradient-to-br from-[#F1F8F3] to-milk p-8 md:p-12 shadow-xl shadow-leaf/5">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-mint/30 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="t-overline text-leaf-600">Bulk &amp; events</p>
            <h2 className="t-h1 mt-3.5">Need milk for a special occasion?</h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">
              Planning a wedding, function, catering event, or festival? Request fresh A2 buffalo milk in bulk,
              and we&apos;ll get back to you with the best pricing and delivery options.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {OCCASIONS.map((o) => (
                <li key={o} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-ink-2">{o}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <Link href="/bulk-orders"
              className="inline-flex items-center gap-2 rounded-full bg-leaf px-8 py-3.5 font-semibold text-white shadow-lg shadow-leaf/30 transition hover:-translate-y-0.5">
              Request bulk order <span aria-hidden>→</span>
            </Link>
            <p className="text-sm text-ink-3">Enquiry only · no payment now</p>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
