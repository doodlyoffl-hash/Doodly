import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { CashView } from "./CashView";

export const metadata: Metadata = { title: "Cash Collection · DOODLY Driver", robots: { index: false } };

export default function DriverCashPage() {
  return (
    <>
      <PageHead title="Cash Collection" sub="Cash collected on today's route." />
      <CashView />
    </>
  );
}
