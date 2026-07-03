import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { ProfileView } from "./ProfileView";

export const metadata: Metadata = { title: "Profile · DOODLY", robots: { index: false } };

export default function ProfilePage() {
  return (
    <>
      <PageHead title="Profile" sub="Your personal details, used for orders and deliveries." />
      <ProfileView />
    </>
  );
}
