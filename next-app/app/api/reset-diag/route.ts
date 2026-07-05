/* TEMPORARY diagnostic — echoes the computed storefront base for the reset link.
   No side effects, no secrets. Remove after verifying the prod reset-link host. */
import { NextRequest, NextResponse } from "next/server";
import { storefrontBase } from "@/lib/auth/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = storefrontBase(req);
  return NextResponse.json({
    origin: req.headers.get("origin"),
    envStorefrontUrl: process.env.NEXT_PUBLIC_STOREFRONT_URL || null,
    envSiteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    envStaticOrigins: process.env.STATIC_ORIGINS || null,
    computedBase: base,
    resetLinkWouldBe: `${base}/reset-password.html?token=SAMPLE`,
  });
}
