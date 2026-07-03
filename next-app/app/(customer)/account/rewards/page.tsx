import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { RewardsView } from "./RewardsView";

export const metadata: Metadata = { title: "Rewards · DOODLY", robots: { index: false } };

export default function RewardsPage() {
  return (
    <>
      <PageHead title="Rewards" sub="Earn points on every delivery and unlock perks." />
      <RewardsView />
    </>
  );
}
