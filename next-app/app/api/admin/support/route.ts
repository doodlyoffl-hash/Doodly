/* /api/admin/support — System → Support Tickets desk.
   GET  ?view=list|dashboard|detail|reports  (+filters / id / preset / from / to)  → view perm
   POST { action: "create"|"update"|"assign"|"priority"|"status"|"reply"|"note"|"close"|"reopen"|"merge"|"delete"|"restore"|"bulk"|"log", … }
        mutations → manage (support:edit); log → view. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listTickets, ticketDashboard, ticketDetail, ticketReports,
  createTicket, updateTicket, assignTicket, changePriority, changeStatus, addMessage, closeTicket, reopenTicket, mergeTicket, softDeleteTicket, restoreTicket, bulkTickets,
} from "@/lib/support/service";
import { actorRole, actorId, canViewSupport, canManageSupport } from "@/lib/support/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preset = "today" | "last7" | "last30" | "thisMonth" | "all";
function resolvePreset(p: Preset | null): { from?: string; to?: string } {
  if (!p || p === "all") return {};
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date(); const s = new Date(now); s.setHours(0, 0, 0, 0);
  switch (p) {
    case "today": return { from: iso(s), to: iso(s) };
    case "last7": { const f = new Date(s); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(s) }; }
    case "last30": { const f = new Date(s); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(s) }; }
    case "thisMonth": { const f = new Date(now.getFullYear(), now.getMonth(), 1); const t = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { from: iso(f), to: iso(t) }; }
    default: return {};
  }
}
const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewSupport(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  const range = sp.get("preset") ? resolvePreset(sp.get("preset") as Preset) : {};
  try {
    if (view === "dashboard") return NextResponse.json(await ticketDashboard(), { headers: { "Cache-Control": "no-store" } });
    if (view === "reports") return NextResponse.json(await ticketReports({ from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to }), { headers: { "Cache-Control": "no-store" } });
    if (view === "detail") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ ticket: await ticketDetail(id) }, { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json(await listTickets({
      q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, priority: sp.get("priority") ?? undefined, category: sp.get("category") ?? undefined,
      assignee: sp.get("assignee") ?? undefined, customer: sp.get("customer") ?? undefined, sort: sp.get("sort") ?? undefined,
      page: num(sp.get("page")), pageSize: num(sp.get("pageSize")), from: sp.get("from") ?? range.from, to: sp.get("to") ?? range.to, includeDeleted: sp.get("includeDeleted") === "1",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.support.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  }
}

const IdOnly = z.object({ id: z.string().min(1) });
export async function POST(req: NextRequest) {
  const role = actorRole(req);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const ctx = reqContext(req);
  const actor = { actorId: actorId(req), actorRole: role, actorName: (typeof body.actorName === "string" && body.actorName) || role };
  if (action === "log") {
    if (!canViewSupport(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await audit({ actorRole: role, action: `support.${String(body.event ?? "export")}`, target: String(body.target ?? "tickets"), ctx });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!canManageSupport(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    let result: unknown; let target = "";
    if (action === "create") { const t = await createTicket(body.data ?? body, actor); result = t; target = t.number; }
    else if (action === "update") { const { id } = IdOnly.parse(body); const t = await updateTicket(id, body.data ?? body); result = t; target = t.number; }
    else if (action === "assign") { const b = z.object({ id: z.string().min(1), assigneeId: z.string(), assigneeName: z.string().optional() }).parse(body); result = await assignTicket(b.id, b.assigneeId, b.assigneeName, actor); target = b.id; }
    else if (action === "priority") { const b = z.object({ id: z.string().min(1), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]) }).parse(body); result = await changePriority(b.id, b.priority, actor); target = b.id; }
    else if (action === "status") { const b = z.object({ id: z.string().min(1), status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]) }).parse(body); result = await changeStatus(b.id, b.status, actor); target = b.id; }
    else if (action === "reply" || action === "note") { const b = z.object({ id: z.string().min(1), body: z.string().trim().min(1).max(20000) }).parse(body); result = await addMessage(b.id, action, b.body, actor); target = b.id; }
    else if (action === "close") { const b = z.object({ id: z.string().min(1), resolutionNote: z.string().max(4000).optional() }).parse(body); result = await closeTicket(b.id, b.resolutionNote, actor); target = b.id; }
    else if (action === "reopen") { const { id } = IdOnly.parse(body); result = await reopenTicket(id, actor); target = id; }
    else if (action === "merge") { const b = z.object({ id: z.string().min(1), intoId: z.string().min(1) }).parse(body); result = await mergeTicket(b.id, b.intoId, actor); target = b.id; }
    else if (action === "delete") { const { id } = IdOnly.parse(body); result = await softDeleteTicket(id); target = id; }
    else if (action === "restore") { const { id } = IdOnly.parse(body); result = await restoreTicket(id); target = id; }
    else if (action === "bulk") { const b = z.object({ bulkAction: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(1000) }).parse(body); result = await bulkTickets(b.bulkAction, b.ids, actor); target = `${b.ids.length} ticket(s) · ${b.bulkAction}`; }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `support.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
