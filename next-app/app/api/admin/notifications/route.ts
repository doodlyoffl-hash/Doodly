/* /api/admin/notifications — Content → Notifications (campaigns).
   GET  ?view=list|dashboard|detail|audience  (+filters / id / audience)  → view perm
   POST { action: "create"|"send"|"createAndSend"|"delete"|"restore"|"log", … }  → manage (notifications:edit) */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCampaigns, notificationsDashboard, campaignDetail, audienceCount,
  createCampaign, sendCampaign, createAndSend, softDeleteCampaign, restoreCampaign,
} from "@/lib/notifications/service";
import { drainPending } from "@/lib/notifications/dispatch";
import { actorRole, actorId, canViewNotifications, canManageNotifications } from "@/lib/notifications/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewNotifications(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  try {
    if (view === "dashboard") return NextResponse.json(await notificationsDashboard(), { headers: { "Cache-Control": "no-store" } });
    if (view === "audience") { const a = sp.get("audience") ?? "All customers"; return NextResponse.json({ audience: a, count: await audienceCount(a) }, { headers: { "Cache-Control": "no-store" } }); }
    if (view === "detail") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ campaign: await campaignDetail(id) }, { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json(await listCampaigns({ q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, channel: sp.get("channel") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")), includeDeleted: sp.get("includeDeleted") === "1" }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.notifications.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load campaigns." }, { status: 500 });
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
    if (!canViewNotifications(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await audit({ actorRole: role, action: `notification.${String(body.event ?? "export")}`, target: String(body.target ?? "campaigns"), ctx });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!canManageNotifications(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    let result: unknown; let target = "";
    if (action === "create") { const c = await createCampaign(body.data ?? body, actor); result = c; target = c.name; }
    else if (action === "send") { const { id } = IdOnly.parse(body); const c = await sendCampaign(id, actor); result = c; target = `${c.name} → ${c.deliveredCount} recipient(s)`; }
    else if (action === "createAndSend") { const c = await createAndSend(body.data ?? body, actor); result = c; target = `${c.name} → ${c.deliveredCount} recipient(s)`; }
    else if (action === "delete") { const { id } = IdOnly.parse(body); result = await softDeleteCampaign(id); target = id; }
    else if (action === "restore") { const { id } = IdOnly.parse(body); result = await restoreCampaign(id); target = id; }
    else if (action === "drain") { const r = await drainPending(500); result = r; target = `dispatched ${r.sent}/${r.processed}`; }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `notification.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
