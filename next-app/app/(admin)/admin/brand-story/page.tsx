import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/Shell";
import { BRAND_STORY } from "@/config/brand-story";
import { BrandStoryAdmin } from "./BrandStoryAdmin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand Story", robots: { index: false } };

export default function AdminBrandStoryPage() {
  return (
    <>
      <PageHead title="Brand Story — UNFOLD PURE" sub="Edit the /doodly story hero, CTAs and QR destination, and download the packaging QR. Changes go live within 10 minutes (no deploy)." />
      <BrandStoryAdmin defaults={{
        heroEyebrow: BRAND_STORY.hero.eyebrow, heroTitle: BRAND_STORY.hero.title, heroLead: BRAND_STORY.hero.lead, heroSub: BRAND_STORY.hero.sub,
        hookTitle: BRAND_STORY.hook.title, hookLine: BRAND_STORY.hook.lines[0],
        qrDestination: BRAND_STORY.qrDestination, path: BRAND_STORY.path,
      }} />
    </>
  );
}
