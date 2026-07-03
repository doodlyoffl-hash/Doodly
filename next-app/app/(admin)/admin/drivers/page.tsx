import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { DriversBoard } from "./DriversBoard";

export const metadata: Metadata = { title: "Drivers · DOODLY Admin", robots: { index: false } };

export default function AdminDriversPage() {
  return (
    <>
      <PageHead title="Delivery Executives" sub="Your delivery team — onboard, edit and track." />
      <DriversBoard />
    </>
  );
}
