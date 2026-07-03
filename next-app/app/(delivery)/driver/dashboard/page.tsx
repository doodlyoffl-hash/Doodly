import type { Metadata } from "next";
import { DriverDashboardView } from "./DriverDashboardView";

export const metadata: Metadata = { title: "Driver Dashboard · DOODLY", robots: { index: false } };

export default function DriverDashboard() {
  return <DriverDashboardView />;
}
