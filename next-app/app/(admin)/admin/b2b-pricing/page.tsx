import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { PricingBoard } from "./PricingBoard";

export const metadata: Metadata = { title: "B2B Pricing · DOODLY Admin", robots: { index: false } };

export default function AdminB2BPricingPage() {
  return (
    <>
      <PageHead title="B2B Pricing" sub="Per-business negotiated product pricing, discounts and GST." />
      <PricingBoard />
    </>
  );
}
