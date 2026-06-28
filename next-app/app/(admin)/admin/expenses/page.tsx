import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { ExpensesBoard } from "./ExpensesBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Daily Expenses", robots: { index: false } };

export default function AdminExpensesPage() {
  return (
    <>
      <PageHead title="Daily Expenses" sub="Record, approve, track and report all business expenses — Accountant, Admin & Super Admin only." />
      <ExpensesBoard />
    </>
  );
}
