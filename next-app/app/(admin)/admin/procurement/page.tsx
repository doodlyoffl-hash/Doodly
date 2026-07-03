import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { ProcurementBoard } from "./ProcurementBoard";

export const metadata: Metadata = { title: "Procurement · DOODLY Admin", robots: { index: false } };

export default function AdminProcurementPage() {
  return (
    <>
      <PageHead title="Procurement" sub="Daily milk collection from your farmers." />
      <ProcurementBoard />
    </>
  );
}
