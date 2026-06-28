import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { HelpTip } from "@/components/help/HelpTip";
import { WalletPanel } from "./WalletView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallet", robots: { index: false } };

export default function WalletPage() {
  return (
    <>
      <div className="flex items-center gap-2">
        <PageHead title="DOODLY Wallet" sub="Your cashback, rewards and credits — usable on any future order or renewal." />
        <HelpTip tipKey="wallet" />
      </div>
      <WalletPanel />
    </>
  );
}
