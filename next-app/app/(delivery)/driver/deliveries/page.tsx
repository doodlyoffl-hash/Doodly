import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { DeliveriesView } from "./DeliveriesView";

export const metadata: Metadata = { title: "Deliveries · DOODLY Driver", robots: { index: false } };

export default function DriverDeliveriesPage() {
  return (
    <>
      <PageHead title="Today's Deliveries" sub="Every stop on today's route, including completed." />
      <DeliveriesView />
    </>
  );
}
