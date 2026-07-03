/* /api/careers — public careers endpoint (unauthenticated storefront).
   GET            → { positions }  (for the apply-form dropdown)
   POST           → submit a job application → { ok, refNo }
   Resume arrives as base64 (size-capped in the service) or a link. */
import { NextRequest, NextResponse } from "next/server";
import { createApplication, POSITIONS } from "@/lib/careers/service";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ positions: POSITIONS }, { headers: { "Cache-Control": "public, max-age=300" } });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const ip = reqContext(req).ip ?? undefined;
    const res = await createApplication(body, ip);
    return NextResponse.json({ ok: true, refNo: res.refNo });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Please check the form and try again." }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Could not submit your application." }, { status: 409 });
  }
}
