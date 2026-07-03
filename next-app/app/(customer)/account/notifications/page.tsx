import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { NotificationsView } from "./NotificationsView";

export const metadata: Metadata = { title: "Notifications · DOODLY", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <>
      <PageHead title="Notifications" sub="Delivery updates, offers and account alerts." />
      <NotificationsView />
    </>
  );
}
