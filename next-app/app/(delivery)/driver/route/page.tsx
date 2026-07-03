import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { RouteView } from "./RouteView";

export const metadata: Metadata = { title: "Today's Route · DOODLY", robots: { index: false } };

export default function DriverRoutePage() {
  return (
    <>
      <PageHead title="Today's Route" sub="Your stops in delivery order. Tap Navigate for turn-by-turn." />
      <RouteView />
    </>
  );
}
