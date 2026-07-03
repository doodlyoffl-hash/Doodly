import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/dashboard/Shell";
import { rscRole, canViewProducts } from "@/lib/products/rsc";
import { ProductsBoard } from "./ProductsBoard";

export const metadata: Metadata = { title: "Products · DOODLY Admin", robots: { index: false } };

// Product management is matrix-gated to roles with products:view (Admin,
// Super-Admin). Other staff are redirected. The API is the real boundary.
export default function AdminProductsPage() {
  if (!canViewProducts(rscRole())) redirect("/admin/dashboard");
  return (
    <>
      <PageHead title="Products" sub="Catalogue: pricing, variants, images, SEO, inventory, bulk actions and reports." />
      <ProductsBoard />
    </>
  );
}
