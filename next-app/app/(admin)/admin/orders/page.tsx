import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { OrdersBoard } from "./OrdersBoard";

export const metadata: Metadata = { title: "Orders · DOODLY Admin", robots: { index: false } };

export default function AdminOrdersPage() {
  return (
    <>
      <PageHead title="Orders" sub="Every order across the platform." />
      <OrdersBoard />
    </>
  );
}
