import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { DeliveriesBoard } from "./DeliveriesBoard";

export const metadata: Metadata = { title: "Delivery Management · DOODLY Admin", robots: { index: false } };

export default function AdminDeliveriesPage() {
  return (
    <>
      <PageHead title="Delivery Management" sub="Track and assign every delivery on the platform." />
      <DeliveriesBoard />
    </>
  );
}
