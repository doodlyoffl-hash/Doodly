import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { B2BBoard } from "./B2BBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "B2B Order Management", robots: { index: false } };

export default function AdminB2BPage() {
  return (
    <>
      <PageHead title="B2B Order Management" sub="Bulk milk & dairy orders for hotels, restaurants, cafés, caterers and more — Admin & Super Admin only." />
      <B2BBoard />
    </>
  );
}
