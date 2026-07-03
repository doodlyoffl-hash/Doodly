import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { CmsBoard } from "./CmsBoard";

export const metadata: Metadata = { title: "CMS · DOODLY Admin", robots: { index: false } };

export default function AdminCmsPage() {
  return (
    <>
      <PageHead title="Content (CMS)" sub="Edit the content blocks that power the storefront." />
      <CmsBoard />
    </>
  );
}
