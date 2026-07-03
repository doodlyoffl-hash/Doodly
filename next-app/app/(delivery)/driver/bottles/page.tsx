import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { BottlesView } from "./BottlesView";

export const metadata: Metadata = { title: "Bottle Collection · DOODLY Driver", robots: { index: false } };

export default function DriverBottlesPage() {
  return (
    <>
      <PageHead title="Bottle Collection" sub="Empties to pick up on today's route. Record them on each delivery." />
      <BottlesView />
    </>
  );
}
