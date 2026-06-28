import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { BulkOrdersBoard } from "./BulkOrdersBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bulk Orders", robots: { index: false } };

export default function AdminBulkOrdersPage() {
  return (
    <>
      <PageHead title="Bulk Orders" sub="Enquiries for weddings, events, catering, hotels & restaurants." />
      <BulkOrdersBoard />
    </>
  );
}
