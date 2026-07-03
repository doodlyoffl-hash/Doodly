/* /api/admin/chat — System → Chat Support management.
   GET  ?view=list|dashboard|detail  (+filters / id)  → view perm
   POST { action: "send"|"note"|"assign"|"transfer"|"status"|"close"|"reopen"|"escalate"|"csat"|"delete"|"restore"|"bulk"|"log", … }
        mutations → manage (chatSupport/support edit); log → view. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listSessions, chatDashboard, sessionDetail,
  addChatMessage, assignChat, transferChat, setChatStatus, closeChat, reopenChat, escalateChat, setCsat, softDeleteChat, restoreChat, bulkChat,
} from "@/lib/chat/service";
import { actorRole, actorId, canViewChat, canManageChat } from "@/lib/chat/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewChat(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  try {
    if (view === "dashboard") return NextResponse.json(await chatDashboard(), { headers: { "Cache-Control": "no-store" } });
    if (view === "detail") { const id = sp.get("id"); if (!id) return NextResponse.json({ error: "id required" }, { status: 400 }); return NextResponse.json({ session: await sessionDetail(id) }, { headers: { "Cache-Control": "no-store" } }); }
    return NextResponse.json(await listSessions({
      q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, handledBy: sp.get("handledBy") ?? undefined, assignee: sp.get("assignee") ?? undefined,
      sort: sp.get("sort") ?? undefined, page: num(sp.get("page")), pageSize: num(sp.get("pageSize")), from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, includeDeleted: sp.get("includeDeleted") === "1", withMessages: sp.get("messages") === "1",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("admin.chat.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load chats." }, { status: 500 });
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
    if (!canViewChat(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await audit({ actorRole: role, action: `chat.${String(body.event ?? "export")}`, target: String(body.target ?? "chats"), ctx });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!canManageChat(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    let result: unknown; let target = "";
    if (action === "send") { const b = z.object({ id: z.string().min(1), body: z.string().trim().min(1).max(8000) }).parse(body); result = await addChatMessage(b.id, "agent", b.body, actor); target = b.id; }
    else if (action === "note") { const b = z.object({ id: z.string().min(1), body: z.string().trim().min(1).max(8000) }).parse(body); result = await addChatMessage(b.id, "note", b.body, actor); target = b.id; }
    else if (action === "assign") { const b = z.object({ id: z.string().min(1), assigneeId: z.string(), assigneeName: z.string().optional() }).parse(body); result = await assignChat(b.id, b.assigneeId, b.assigneeName); target = b.id; }
    else if (action === "transfer") { const b = z.object({ id: z.string().min(1), assigneeId: z.string(), assigneeName: z.string().optional() }).parse(body); result = await transferChat(b.id, b.assigneeId, b.assigneeName); target = b.id; }
    else if (action === "status") { const b = z.object({ id: z.string().min(1), status: z.enum(["ACTIVE", "WAITING", "RESOLVED", "ESCALATED", "CLOSED"]) }).parse(body); result = await setChatStatus(b.id, b.status); target = b.id; }
    else if (action === "close") { const { id } = IdOnly.parse(body); result = await closeChat(id); target = id; }
    else if (action === "reopen") { const { id } = IdOnly.parse(body); result = await reopenChat(id); target = id; }
    else if (action === "escalate") { const { id } = IdOnly.parse(body); result = await escalateChat(id); target = id; }
    else if (action === "csat") { const b = z.object({ id: z.string().min(1), csat: z.number().min(1).max(5) }).parse(body); result = await setCsat(b.id, b.csat); target = b.id; }
    else if (action === "delete") { const { id } = IdOnly.parse(body); result = await softDeleteChat(id); target = id; }
    else if (action === "restore") { const { id } = IdOnly.parse(body); result = await restoreChat(id); target = id; }
    else if (action === "bulk") { const b = z.object({ bulkAction: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(1000) }).parse(body); result = await bulkChat(b.bulkAction, b.ids); target = `${b.ids.length} chat(s) · ${b.bulkAction}`; }
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await audit({ actorRole: role, action: `chat.${action}`, target, ctx });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if ((e as { name?: string })?.name === "ZodError") return NextResponse.json({ error: "Validation failed", issues: (e as { issues?: unknown }).issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
