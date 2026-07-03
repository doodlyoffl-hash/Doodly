import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/dashboard/Shell";
import { rscRole, canViewPayments } from "@/lib/payments/rsc";
import { PaymentsBoard } from "./PaymentsBoard";

export const metadata: Metadata = { title: "Payments · DOODLY Admin", robots: { index: false } };

// Payments is finance data — matrix-gated to roles with payments:view
// (Admin, Super-Admin, Accountant). Other staff are redirected.
export default function AdminPaymentsPage() {
  if (!canViewPayments(rscRole())) redirect("/admin/dashboard");
  return (
    <>
      <PageHead title="Payments" sub="Unified ledger: collections, refunds, wallet, auto-pay, gateways, invoices and reports." />
      <PaymentsBoard />
    </>
  );
}
