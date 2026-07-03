import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { CalendarView } from "./CalendarView";

export const metadata: Metadata = { title: "Delivery Calendar · DOODLY", robots: { index: false } };

export default function CalendarPage() {
  return (
    <>
      <PageHead title="Delivery Calendar" sub="A month-at-a-glance view of your deliveries." />
      <CalendarView />
    </>
  );
}
