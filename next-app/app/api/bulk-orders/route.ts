/* /api/bulk-orders
   POST (public)  — submit a bulk milk enquiry. Validated, spam-trapped.
   GET  (admin)   — list requests + stats (RBAC: orders:view). */
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { BulkRequestSchema } from "@/lib/bulk/validation";
import { createBulkRequest, listBulkRequests, getBulkStats } from "@/lib/bulk/service";
import { actorFrom, canViewBulk } from "@/lib/bulk/guard";
import type { BulkStatus } from "@/lib/bulk/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = BulkRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form", issues: parsed.error.flatten() }, { status: 422 });
  }
  // Honeypot filled → silently accept without saving (don't tip off bots).
  if (parsed.data.company) return NextResponse.json({ ok: true, code: "BULK-RECEIVED" });

  try {
    const result = await createBulkRequest(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Please check the form", issues: e.flatten() }, { status: 422 });
    console.error("bulk.create", (e as Error)?.message);
    return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const actor = actorFrom(req);
  if (!canViewBulk(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = (req.nextUrl.searchParams.get("status") as BulkStatus | null) ?? undefined;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  try {
    const [requests, stats] = await Promise.all([listBulkRequests({ status, q }), getBulkStats()]);
    return NextResponse.json({ requests, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("bulk.list", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load requests." }, { status: 500 });
  }
}
