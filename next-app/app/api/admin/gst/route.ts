/* /api/admin/gst — System → GST Management.
   GET  ?view=overview|reports  (+ from / to)  → view perm (gst:view or reports:view)
   POST { action: "setGlobal"|"setProduct", … }  → manage (gst:config — super admin)
   Reuses BillingConfig.gstBps (global) + Pricing.taxBps (per-product); the
   billing engine already applies these to orders/invoices/payments. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gstOverview, setGlobalGst, setProductGst, gstReports } from "@/lib/gst/service";
import { can, type RoleKey } from "@/lib/rbac";
import { readRole } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canView = (role: RoleKey) => can(role, "gst", "view") || can(role, "reports", "view");
const canManage = (role: RoleKey) => can(role, "gst", "config"); // super_admin only (admin has gst:full but not the config action)

export async function GET(req: NextRequest) {
  const role = readRole(req);
  if (!canView(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "overview";
  try {
    if (view === "reports") return NextResponse.json(await gstReports({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await gstOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.gst.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load GST config." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = readRole(req);
  if (!canManage(role)) return NextResponse.json({ error: "Forbidden — GST configuration is Super Admin only." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  try {
    let result: unknown; let target = "";
    if (action === "setGlobal") { const b = z.object({ gstBps: z.number().int().min(0).max(10000).optional(), gstin: z.string().max(20).nullable().optional(), companyName: z.string().max(120).optional() }).parse(body); result = await setGlobalGst(b); target = `global GST = ${(b.gstBps ?? 0) / 100}%`; }
    else if (action === "setProduct") { const b = z.object({ product: z.string().min(1), taxBps: z.number().int().min(0).max(10000) }).parse(body); result = await setProductGst(b.product, b.taxBps); target = `${b.product} = ${b.taxBps / 100}%`; }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `gst.${action}`, target, ctx: reqContext(req) });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
