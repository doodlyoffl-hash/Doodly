import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { QualityBoard } from "./QualityBoard";

export const metadata: Metadata = { title: "Quality · DOODLY Admin", robots: { index: false } };

export default function AdminQualityPage() {
  return (
    <>
      <PageHead title="Quality Control" sub="Lab-test every batch before it reaches a customer." />
      <QualityBoard />
    </>
  );
}
