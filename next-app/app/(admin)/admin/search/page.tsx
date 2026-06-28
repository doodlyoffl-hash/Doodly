import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { SearchInsights } from "./SearchInsights";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search Insights", robots: { index: false } };

export default function AdminSearchPage() {
  return (
    <>
      <PageHead title="Search Insights" sub="What customers search for — top keywords, no-result terms, most-clicked results — and the trending searches shown in the palette." />
      <SearchInsights />
    </>
  );
}
