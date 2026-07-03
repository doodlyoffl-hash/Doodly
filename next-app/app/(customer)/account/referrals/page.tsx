import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { ReferralsView } from "./ReferralsView";

export const metadata: Metadata = { title: "Referrals · DOODLY", robots: { index: false } };

export default function ReferralsPage() {
  return (
    <>
      <PageHead title="Refer & Earn" sub="Give ₹200, get ₹200 for every friend who subscribes." />
      <ReferralsView />
    </>
  );
}
