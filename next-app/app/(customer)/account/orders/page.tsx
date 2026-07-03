import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { OrdersView } from "./OrdersView";

export const metadata: Metadata = { title: "My Orders · DOODLY", robots: { index: false } };

export default function OrdersPage() {
  return (
    <>
      <PageHead title="My Orders" sub="Every order on your account, newest first." />
      <OrdersView />
    </>
  );
}
