import type { Metadata } from "next";
import { DashboardView } from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard · DOODLY", robots: { index: false } };

export default function CustomerDashboard() {
  return <DashboardView />;
}
