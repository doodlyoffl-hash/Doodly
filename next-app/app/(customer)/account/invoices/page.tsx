import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { InvoicesView } from "./InvoicesView";

export const metadata: Metadata = { title: "Invoices · DOODLY", robots: { index: false } };

export default function InvoicesPage() {
  return (
    <>
      <PageHead title="Invoices" sub="Download GST invoices for your orders." />
      <InvoicesView />
    </>
  );
}
