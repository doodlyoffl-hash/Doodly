import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { AssignmentBoard } from "./AssignmentBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Auto Delivery Assignment", robots: { index: false } };

export default function AssignmentsPage() {
  return (
    <>
      <PageHead title="Auto Delivery Assignment" sub="Capacity-aware distribution · 45 bottles per executive per trip." />
      <AssignmentBoard />
    </>
  );
}
