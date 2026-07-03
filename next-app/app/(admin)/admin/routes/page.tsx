import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { RoutesBoard } from "./RoutesBoard";

export const metadata: Metadata = { title: "Routes · DOODLY Admin", robots: { index: false } };

export default function AdminRoutesPage() {
  return (
    <>
      <PageHead title="Delivery Routes" sub="Plan routes and assign them to your executives." />
      <RoutesBoard />
    </>
  );
}
