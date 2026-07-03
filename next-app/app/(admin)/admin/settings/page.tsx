import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "Settings · DOODLY Admin", robots: { index: false } };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHead title="Settings" sub="Platform-wide configuration." />
      <SettingsView />
    </>
  );
}
