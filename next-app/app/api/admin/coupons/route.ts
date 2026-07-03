/* /api/admin/coupons — Growth → Coupons promotion engine.
   GET  ?view=list|dashboard|reports|detail  (+filters / id / preset / from / to)   → view perm
   POST { action: "create"|"update"|"activate"|"deactivate"|"delete"|"restore"|"duplicate"|"bulk"|"log", … }
        create/update/lifecycle/bulk → manage (marketing/admin/super); log → view. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCoupons, couponDashboard, couponReports, couponDetail,
  createCoupon, updateCoupon, setCouponActive, softDeleteCoupon, restoreCoupon, duplicateCoupon, bulkCoupons,
} from "@/lib/coupons/service";
import { actorRole, actorId, canViewCoupons, canManageCoupons } from "@/lib/coupons/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "last7" | "last30" | "thisMonth" | "fy" | "all";
function resolvePreset(p: Preset | null): { from?: string; to?: string } {
  if (!p || p === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (p) {
    case "today": return { from: iso(s), to: iso(s) };
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    case "fy": { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewCoupons(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
  try {
    if (view === "dashboard") return NextResponse.json(await couponDashboard(), { headers: { "Cache-Control": "no-store" } });
    if (view === "reports") return NextResponse.json(await couponReports({ from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to }), { headers: { "Cache-Control": "no-store" } });
    if (view === "detail") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json(await couponDetail(id), { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json(await listCoupons({
      q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, discountType: sp.get("discountType") ?? undefined, campaign: sp.get("campaign") ?? undefined,
      sort: sp.get("sort") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")),
      from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to, includeDeleted: sp.get("includeDeleted") === "1",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.coupons.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load coupons." }, { status: 500 });
  }
}

const IdOnly = z.object({ id: z.string().min(1) });
export async function POST(req: NextRequest) {
  const role = actorRole(req);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const ctx = reqContext(req);
  const actor = { actorId: actorId(req), actorRole: role };

  if (action === "log") {
    if (!canViewCoupons(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parts = [body.reportName && `“${body.reportName}”`, body.format && `[${body.format}]`, body.filters && `(${body.filters})`].filter(Boolean).join(" ");
    await audit({ actorRole: role, action: `coupon.${String(body.event ?? "generated")}`, target: parts || "coupons", ctx });
    return NextResponse.json({ ok: true, logged: true });
  }

  if (!canManageCoupons(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    let result: unknown; let target = "";
    if (action === "create") { const c = await createCoupon(body.data ?? body, actor); result = c; target = c.code; }
    else if (action === "update") { const { id } = IdOnly.parse(body); const c = await updateCoupon(id, body.data ?? body, actor); result = c; target = c.code; }
    else if (action === "activate") { const { id } = IdOnly.parse(body); result = await setCouponActive(id, true); target = id; }
    else if (action === "deactivate") { const { id } = IdOnly.parse(body); result = await setCouponActive(id, false); target = id; }
    else if (action === "delete") { const { id } = IdOnly.parse(body); result = await softDeleteCoupon(id); target = id; }
    else if (action === "restore") { const { id } = IdOnly.parse(body); result = await restoreCoupon(id); target = id; }
    else if (action === "duplicate") { const { id } = IdOnly.parse(body); const c = await duplicateCoupon(id, actor); result = c; target = c.code; }
    else if (action === "bulk") {
      const b = z.object({ bulkAction: z.enum(["activate", "deactivate", "delete", "restore", "expiry"]), ids: z.array(z.string().min(1)).min(1).max(1000), expiresAt: z.string().optional() }).parse(body);
      result = await bulkCoupons(b.bulkAction, b.ids, { expiresAt: b.expiresAt }); target = `${b.ids.length} coupon(s) · ${b.bulkAction}`;
    } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `coupon.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
