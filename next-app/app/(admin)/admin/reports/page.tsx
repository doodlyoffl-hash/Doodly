import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { ReportsView } from "./ReportsView";

export const metadata: Metadata = { title: "Reports · DOODLY Admin", robots: { index: false } };

export default function AdminReportsPage() {
  return (
    <>
      <PageHead title="Reports" sub="A live snapshot of the whole business." />
      <ReportsView />
    </>
  );
}
