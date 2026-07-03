import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { InvoicesBoard } from "./InvoicesBoard";

export const metadata: Metadata = { title: "Business Invoices · DOODLY Admin", robots: { index: false } };

export default function AdminBusinessInvoicesPage() {
  return (
    <>
      <PageHead title="Business Invoices" sub="Issue, track, collect and report on B2B tax invoices." />
      <InvoicesBoard />
    </>
  );
}
