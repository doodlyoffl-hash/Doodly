import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/dashboard/Shell";
import { rscRole, isSubsAdminRole } from "@/lib/subscriptions/rsc";
import { SubscriptionsBoard } from "./SubscriptionsBoard";

export const metadata: Metadata = { title: "Subscriptions · DOODLY Admin", robots: { index: false } };

// Subscriptions management is Admin + Super-Admin only — stricter than the shared
// RBAC matrix (which grants `support` subscriptions:view for other surfaces).
export default function AdminSubscriptionsPage() {
  if (!isSubsAdminRole(rscRole())) redirect("/admin/dashboard");
  return (
    <>
      <PageHead title="Subscriptions" sub="Manage every plan: dashboard, lifecycle, AutoPay, schedule, cashback and reports." />
      <SubscriptionsBoard />
    </>
  );
}
