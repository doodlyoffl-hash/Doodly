/* GET /api/ops/manifest?token=... — the delivery manifest PDF behind a SIGNED,
   time-boxed link (no admin login). This is what the WhatsApp / email summary
   points at, because Superfone has no document-attachment endpoint.

   The token is the ONLY authority here and it is scoped to one delivery day, so
   this route deliberately lives outside /api/admin (which is RBAC-gated) — a
   valid token grants exactly one day's sheet and nothing else. Staff with a real
   admin session should use /api/admin/deliveries/manifest/export instead. */
import { NextRequest, NextResponse } from "next/server";
import { verifyManifestToken } from "@/lib/ops/manifest-token";
import { renderManifestPdf } from "@/lib/ops/manifest-pdf";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "A signed link is required." }, { status: 401 });

  const day = await verifyManifestToken(token);
  if (!day) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });

  try {
    const { bytes, filename, report } = await renderManifestPdf(day);
    await audit({
      actorRole: "system",
      action: "ops.manifest.link_open",
      target: `${report.date} · ${report.totals.stops} stop(s) · signed link`,
      ctx: reqContext(req),
    }).catch(() => { /* never block the download */ });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    console.error("ops.manifest.link", (e as Error)?.message);
    return NextResponse.json({ error: "Could not generate the manifest." }, { status: 500 });
  }
}
