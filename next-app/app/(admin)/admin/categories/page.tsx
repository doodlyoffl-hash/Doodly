import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { CategoriesBoard } from "./CategoriesBoard";

export const metadata: Metadata = { title: "Categories · DOODLY Admin", robots: { index: false } };

export default function AdminCategoriesPage() {
  return (
    <>
      <PageHead title="Categories" sub="Organise the catalogue into shoppable groups." />
      <CategoriesBoard />
    </>
  );
}
