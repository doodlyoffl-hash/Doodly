import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { HistoryView } from "./HistoryView";

export const metadata: Metadata = { title: "History · DOODLY Driver", robots: { index: false } };

export default function DriverHistoryPage() {
  return (
    <>
      <PageHead title="Delivery History" sub="Every delivery you've completed." />
      <HistoryView />
    </>
  );
}
