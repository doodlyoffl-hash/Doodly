import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { UsersBoard } from "./UsersBoard";

export const metadata: Metadata = { title: "Users · DOODLY Admin", robots: { index: false } };

export default function AdminUsersPage() {
  return (
    <>
      <PageHead title="Users & Roles" sub="Manage staff accounts and what each role can access." />
      <UsersBoard />
    </>
  );
}
