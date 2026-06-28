import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main id="main-content" className="grid min-h-[70vh] place-items-center px-6 py-20 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-mint-soft text-3xl" aria-hidden="true">🥛</div>
        <p className="text-sm font-bold uppercase tracking-widest text-leaf-600">404</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest">This page spilled.</h1>
        <p className="mt-3 text-ink-2">We couldn&apos;t find what you were looking for — but your fresh milk is still on its way.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-full bg-leaf px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5">Back to home</Link>
          <Link href="/products" className="rounded-full border border-line px-6 py-3 font-semibold text-forest transition hover:border-mint">Browse products</Link>
        </div>
      </div>
    </main>
  );
}
