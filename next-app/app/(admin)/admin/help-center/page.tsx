import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { HELP_CATEGORIES } from "@/config/help-center";
import { HelpCenterAdmin } from "./HelpCenterAdmin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help Center", robots: { index: false } };

export default function AdminHelpCenterPage() {
  return (
    <>
      <PageHead title="Help Center" sub="Manage FAQs (add / edit / reorder / publish) and review search & view analytics. Changes go live within 10 minutes — no deploy." />
      <HelpCenterAdmin categories={HELP_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} />
    </>
  );
}
