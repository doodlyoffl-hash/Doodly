import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "./SearchResults";

export const metadata: Metadata = { title: "Search", description: "Search DOODLY products, subscriptions, help and more.", robots: { index: false } };

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1000px] px-5 py-20 text-center text-ink-3">Loading search…</div>}>
      <SearchResults />
    </Suspense>
  );
}
