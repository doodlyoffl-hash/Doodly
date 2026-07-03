import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { CompletedView } from "./CompletedView";

export const metadata: Metadata = { title: "Completed · DOODLY Driver", robots: { index: false } };

export default function DriverCompletedPage() {
  return (
    <>
      <PageHead title="Completed Today" sub="Deliveries you've finished today." />
      <CompletedView />
    </>
  );
}
