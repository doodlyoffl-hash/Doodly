import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/dashboard/Shell";
import { rscRole, isBillingAdminRole } from "@/lib/billing/rsc";
import { BillingBoard } from "./BillingBoard";

export const metadata: Metadata = { title: "Subscription Billing · DOODLY Admin", robots: { index: false } };

// Subscription Billing is Admin + Super-Admin only.
export default function AdminSubscriptionBillingPage() {
  if (!isBillingAdminRole(rscRole())) redirect("/admin/dashboard");
  return (
    <>
      <PageHead title="Subscription Billing" sub="Billing cycles, invoices, payments, auto-pay, wallet and GST — the finance layer over subscriptions." />
      <BillingBoard />
    </>
  );
}
