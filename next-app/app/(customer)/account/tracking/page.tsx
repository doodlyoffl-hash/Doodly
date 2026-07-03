import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { TrackingView } from "./TrackingView";

export const metadata: Metadata = { title: "Tracking · DOODLY", robots: { index: false } };

export default function TrackingPage() {
  return (
    <>
      <PageHead title="Live Tracking" sub="Follow your next delivery from our dairy to your door." />
      <TrackingView />
    </>
  );
}
