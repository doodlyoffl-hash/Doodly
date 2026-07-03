import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "Settings · DOODLY", robots: { index: false } };

export default function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" sub="Manage your password and account security." />
      <SettingsView />
    </>
  );
}
