import Link from "next/link";
import Image from "next/image";
import { BRAND_STORY } from "@/config/brand-story";

/* The "DOODLY" brand-story entry button (with the official logo mark).
   One source, reused in the header, footer and dashboards. Links to the
   immersive /doodly "UNFOLD PURE" experience. */
export function DoodlyButton({ variant = "header", className = "" }: { variant?: "header" | "footer" | "compact"; className?: string }) {
  const base = "group inline-flex items-center gap-2 rounded-full font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2";

  if (variant === "footer") {
    return (
      <Link href={BRAND_STORY.path} aria-label="Read the DOODLY brand story — UNFOLD PURE"
        className={`${base} mt-6 border border-mint/40 bg-white/10 px-4 py-2.5 text-sm text-white hover:border-mint hover:bg-white/15 ${className}`}>
        <Image src="/logo.png" alt="" width={66} height={24} className="h-4 w-auto brightness-0 invert" />
        <span aria-hidden>✦ Unfold Pure</span>
      </Link>
    );
  }

  // header / compact — gold-accent pill with the logo mark
  return (
    <Link href={BRAND_STORY.path} aria-label="DOODLY brand story — UNFOLD PURE"
      className={`${base} border border-gold/40 bg-gold-soft/70 px-3 py-2 text-sm text-forest hover:-translate-y-0.5 hover:border-gold hover:shadow-sm ${className}`}>
      <Image src="/logo.png" alt="" width={66} height={24} className="h-4 w-auto" />
      <span className="hidden text-xs font-bold uppercase tracking-wide text-gold sm:inline" aria-hidden>Story</span>
    </Link>
  );
}
