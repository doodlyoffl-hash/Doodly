import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { DeliveriesView } from "./DeliveriesView";

export const metadata: Metadata = { title: "Deliveries · DOODLY", robots: { index: false } };

export default function DeliveriesPage() {
  return (
    <>
      <PageHead title="Deliveries" sub="Your upcoming and past morning deliveries." />
      <DeliveriesView />
    </>
  );
}
