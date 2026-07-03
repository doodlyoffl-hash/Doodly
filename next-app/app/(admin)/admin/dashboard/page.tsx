import type { Metadata } from "next";
import { AdminDashboardView } from "./AdminDashboardView";

export const metadata: Metadata = { title: "Admin Dashboard · DOODLY", robots: { index: false } };

export default function AdminDashboard() {
  return <AdminDashboardView />;
}
