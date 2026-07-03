/* =============================================================
   DOODLY System → Chat Support — service layer (Prisma).
   Persists customer conversations (AI + human) that previously
   lived only in the assistant's localStorage. Sessions carry
   status/handledBy/assignee/CSAT/escalation + a message timeline.
   Assign / transfer / close / reopen / escalate / CSAT + dashboard.
   Actor/customer ids are plain strings (no User FK).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

interface Actor { actorId?: string; actorName?: string; actorRole?: string }

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export const CHAT_STATUSES = ["ACTIVE", "WAITING", "RESOLVED", "ESCALATED", "CLOSED"] as const;
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", WAITING: "Waiting", RESOLVED: "Resolved", ESCALATED: "Escalated", CLOSED: "Closed" };

type SessionRow = Prisma.ChatSessionGetPayload<{}>;
type MessageRow = Prisma.ChatMessageGetPayload<{}>;

function shape(s: SessionRow & { _count?: { messages: number } }) {
  return {
    id: s.id, number: s.number, customerId: s.customerId, customerName: s.customerName, customerEmail: s.customerEmail,
    channel: s.channel, status: s.status, statusLabel: STATUS_LABEL[s.status] || s.status, handledBy: s.handledBy,
    assigneeId: s.assigneeId, assigneeName: s.assigneeName, csat: s.csat, escalated: s.escalated, topics: s.topics,
    turns: s._count?.messages ?? undefined, lastMessageAt: s.lastMessageAt, closedAt: s.closedAt, deletedAt: s.deletedAt, createdAt: s.createdAt,
  };
}
function shapeMessage(m: MessageRow) {
  return { id: m.id, role: m.role, authorName: m.authorName, body: m.body, intent: m.intent, createdAt: m.createdAt };
}

async function nextNumber(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const n = `CHAT-${Math.abs((Date.now() + i) % 0xfffff).toString(16).toUpperCase().padStart(5, "0")}`;
    const dup = await db.chatSession.findUnique({ where: { number: n }, select: { id: true } });
    if (!dup) return n;
  }
  return `CHAT-${Date.now().toString(16).toUpperCase()}`;
}

// ---------------------------------------------------------------- list + detail
export interface ChatFilters { q?: string; status?: string; handledBy?: string; assignee?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number; includeDeleted?: boolean; withMessages?: boolean }
export async function listSessions(f: ChatFilters = {}) {
  const where: Prisma.ChatSessionWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.status) where.status = f.status as Prisma.EnumChatStatusFilter["equals"];
  if (f.handledBy) where.handledBy = f.handledBy;
  if (f.assignee) where.assigneeId = f.assignee;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ number: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { customerEmail: { contains: q, mode: "insensitive" } }, { assigneeName: { contains: q, mode: "insensitive" } }, { messages: { some: { body: { contains: q, mode: "insensitive" } } } }]; }
  const orderBy: Prisma.ChatSessionOrderByWithRelationInput = f.sort === "created" ? { createdAt: "desc" } : { lastMessageAt: "desc" };
  const total = await db.chatSession.count({ where });
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  const rows = await db.chatSession.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { messages: true } }, ...(f.withMessages ? { messages: { orderBy: { createdAt: "asc" } } } : {}) } });
  const sessions = rows.map((r) => (f.withMessages ? { ...shape(r), messages: (r as SessionRow & { messages: MessageRow[] }).messages.map(shapeMessage) } : shape(r)));
  return { sessions, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
export async function sessionDetail(id: string) {
  const s = await db.chatSession.findFirst({ where: { OR: [{ id }, { number: id }] }, include: { messages: { orderBy: { createdAt: "asc" } }, _count: { select: { messages: true } } } });
  if (!s) throw new Error("Chat not found");
  return { ...shape(s), messages: s.messages.map(shapeMessage) };
}

// ---------------------------------------------------------------- create + messages
export const ChatCreateSchema = z.object({
  customerId: z.string().max(60).optional().or(z.literal("")),
  customerName: z.string().trim().max(120).optional().or(z.literal("")),
  customerEmail: z.string().trim().max(160).optional().or(z.literal("")),
  channel: z.string().max(20).optional(),
  message: z.string().trim().max(8000).optional().or(z.literal("")),
});
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };

export async function createSession(raw: unknown) {
  const d = ChatCreateSchema.parse(raw);
  const number = await nextNumber();
  const s = await db.chatSession.create({ data: { number, customerId: clean(d.customerId), customerName: clean(d.customerName) ?? "Guest", customerEmail: clean(d.customerEmail), channel: d.channel || "web", status: "ACTIVE", handledBy: "AI" } });
  if (d.message && d.message.trim()) await db.chatMessage.create({ data: { sessionId: s.id, role: "user", authorName: s.customerName, body: d.message.trim() } });
  return shape(s);
}
export async function addChatMessage(id: string, role: "user" | "bot" | "agent" | "note", body: string, actor: Actor, intent?: string) {
  const s = await db.chatSession.findUnique({ where: { id }, select: { id: true, handledBy: true, status: true } });
  if (!s) throw new Error("Chat not found");
  const authorName = role === "agent" ? (actor.actorName ?? actor.actorRole ?? "Agent") : role === "user" ? undefined : role === "note" ? (actor.actorName ?? "Staff") : "Assistant";
  await db.chatMessage.create({ data: { sessionId: id, role, authorName: authorName ?? null, body: body.trim(), intent: intent ?? null } });
  const patch: Prisma.ChatSessionUpdateInput = { lastMessageAt: new Date() };
  if (role === "agent" && s.handledBy !== "Human") patch.handledBy = "Human";
  if ((role === "agent" || role === "bot") && s.status === "WAITING") patch.status = "ACTIVE";
  await db.chatSession.update({ where: { id }, data: patch });
  return sessionDetail(id);
}
async function sys(sessionId: string, body: string) { await db.chatMessage.create({ data: { sessionId, role: "system", body } }); await db.chatSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } }); }

// ---------------------------------------------------------------- lifecycle
export async function assignChat(id: string, assigneeId: string, assigneeName: string | undefined) {
  const s = await db.chatSession.update({ where: { id }, data: { assigneeId: assigneeId || null, assigneeName: assigneeName ?? null, handledBy: assigneeId ? "Human" : "AI" } });
  await sys(id, assigneeId ? `Assigned to ${assigneeName || assigneeId}.` : "Unassigned.");
  return shape(s);
}
export async function transferChat(id: string, assigneeId: string, assigneeName: string | undefined) {
  const s = await db.chatSession.update({ where: { id }, data: { assigneeId: assigneeId || null, assigneeName: assigneeName ?? null, handledBy: "Human", status: "ACTIVE" } });
  await sys(id, `Transferred to ${assigneeName || assigneeId}.`);
  return shape(s);
}
export async function setChatStatus(id: string, status: string) {
  const data: Prisma.ChatSessionUpdateInput = { status: status as SessionRow["status"] };
  if (status === "CLOSED" || status === "RESOLVED") data.closedAt = new Date();
  if (status === "ESCALATED") data.escalated = true;
  if (status === "ACTIVE") data.closedAt = null;
  const s = await db.chatSession.update({ where: { id }, data });
  await sys(id, `Chat marked ${STATUS_LABEL[status] || status}.`);
  return shape(s);
}
export const closeChat = (id: string) => setChatStatus(id, "RESOLVED");
export const reopenChat = (id: string) => setChatStatus(id, "ACTIVE");
export async function escalateChat(id: string) { const s = await db.chatSession.update({ where: { id }, data: { status: "ESCALATED", escalated: true } }); await sys(id, "Chat escalated to a human agent."); return shape(s); }
export async function setCsat(id: string, csat: number) { return shape(await db.chatSession.update({ where: { id }, data: { csat: Math.max(1, Math.min(5, Math.round(csat))) } })); }
export const softDeleteChat = async (id: string) => shape(await db.chatSession.update({ where: { id }, data: { deletedAt: new Date() } }));
export const restoreChat = async (id: string) => shape(await db.chatSession.update({ where: { id }, data: { deletedAt: null } }));
export async function bulkChat(action: string, ids: string[]) {
  if (action === "delete") return db.chatSession.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } }).then((r) => ({ count: r.count }));
  if (action === "restore") return db.chatSession.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } }).then((r) => ({ count: r.count }));
  if (CHAT_STATUSES.includes(action as typeof CHAT_STATUSES[number])) { const data: Prisma.ChatSessionUpdateManyMutationInput = { status: action as SessionRow["status"] }; if (action === "RESOLVED" || action === "CLOSED") data.closedAt = new Date(); return db.chatSession.updateMany({ where: { id: { in: ids } }, data }).then((r) => ({ count: r.count })); }
  throw new Error("Unknown bulk action");
}

// ---------------------------------------------------------------- dashboard
export async function chatDashboard() {
  const now = new Date();
  const [all, csatRows, resolvedToday] = await Promise.all([
    db.chatSession.findMany({ where: { deletedAt: null }, select: { status: true, handledBy: true, escalated: true, topics: true } }),
    db.chatSession.findMany({ where: { deletedAt: null, csat: { not: null } }, select: { csat: true } }),
    db.chatSession.count({ where: { deletedAt: null, closedAt: { gte: soD(now) } } }),
  ]);
  const count = (s: string) => all.filter((x) => x.status === s).length;
  const csatVals = csatRows.map((r) => r.csat!).filter((n) => n > 0);
  const avgCsat = csatVals.length ? Math.round((csatVals.reduce((a, b) => a + b, 0) / csatVals.length) * 10) / 10 : 0;
  const topicTally: Record<string, number> = {};
  all.forEach((s) => { const t = (s.topics as Record<string, number> | null) || {}; Object.entries(t).forEach(([k, v]) => { topicTally[k] = (topicTally[k] || 0) + (Number(v) || 0); }); });
  const topTopics = Object.entries(topicTally).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  return {
    kpis: {
      total: all.length, active: count("ACTIVE"), waiting: count("WAITING"), resolved: count("RESOLVED"), escalated: count("ESCALATED") + all.filter((x) => x.escalated && x.status !== "ESCALATED").length,
      aiHandled: all.filter((x) => x.handledBy === "AI").length, humanHandled: all.filter((x) => x.handledBy === "Human").length,
      avgCsat, csatResponses: csatVals.length, resolvedToday,
    },
    topTopics,
  };
}
