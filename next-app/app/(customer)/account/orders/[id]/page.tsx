import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/dashboard/Shell";
import { OrderDetailView } from "./OrderDetailView";

export const metadata: Metadata = { title: "Order details · DOODLY", robots: { index: false } };

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <div className="mb-2"><Link href="/account/orders" className="text-sm font-semibold text-leaf-600 hover:underline">← All orders</Link></div>
      <PageHead title="Order details" sub="Track, manage and download — everything about this order." />
      <OrderDetailView id={params.id} />
    </>
  );
}
