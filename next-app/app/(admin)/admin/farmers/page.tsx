import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { FarmersBoard } from "./FarmersBoard";

export const metadata: Metadata = { title: "Farmers · DOODLY Admin", robots: { index: false } };

export default function AdminFarmersPage() {
  return (
    <>
      <PageHead title="Farmers" sub="The dairy families who supply your A2 milk." />
      <FarmersBoard />
    </>
  );
}
