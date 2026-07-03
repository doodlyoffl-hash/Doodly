import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { CustomersBoard } from "./CustomersBoard";

export const metadata: Metadata = { title: "Customers · DOODLY Admin", robots: { index: false } };

export default function AdminCustomersPage() {
  return (
    <>
      <PageHead title="Customers" sub="CRM: profiles, addresses, wallet, subscriptions, referrals, notes, bulk actions and reports." />
      <CustomersBoard />
    </>
  );
}
