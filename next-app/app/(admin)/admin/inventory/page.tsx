import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { InventoryBoard } from "./InventoryBoard";

export const metadata: Metadata = { title: "Inventory · DOODLY Admin", robots: { index: false } };

export default function AdminInventoryPage() {
  return (
    <>
      <PageHead title="Inventory" sub="Raw materials and supplies on hand." />
      <InventoryBoard />
    </>
  );
}
