import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { AddressesView } from "./AddressesView";

export const metadata: Metadata = { title: "Addresses · DOODLY", robots: { index: false } };

export default function AddressesPage() {
  return (
    <>
      <PageHead title="Delivery Addresses" sub="Where we bring your fresh milk every morning." />
      <AddressesView />
    </>
  );
}
