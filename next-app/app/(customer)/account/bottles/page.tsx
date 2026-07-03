import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { BottlesView } from "./BottlesView";

export const metadata: Metadata = { title: "Bottle Tracking · DOODLY", robots: { index: false } };

export default function BottlesPage() {
  return (
    <>
      <PageHead title="Bottle Tracking" sub="Return your empties on the next delivery to keep your deposit moving." />
      <BottlesView />
    </>
  );
}
