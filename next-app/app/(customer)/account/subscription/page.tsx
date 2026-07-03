import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { SubscriptionView } from "./SubscriptionView";

export const metadata: Metadata = { title: "My Subscription · DOODLY", robots: { index: false } };

export default function SubscriptionPage() {
  return (
    <>
      <PageHead title="My Subscription" sub="Manage your daily delivery plan." />
      <SubscriptionView />
    </>
  );
}
