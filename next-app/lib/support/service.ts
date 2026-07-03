/* =============================================================
   DOODLY System → Support Tickets — service layer (Prisma).
   Full desk lifecycle: create → assign → in-progress → waiting →
   resolved → closed (⇄ reopen), internal notes + customer replies,
   SLA due dates, priority, category, order/subscription refs,
   soft-delete + restore, duplicate-merge (future-ready), dashboard
   + reports. Actor/customer ids are plain strings (no User FK).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

interface Actor { actorId?: string; actorName?: string; actorRole?: string }

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export const TICKET_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", ASSIGNED: "Assigned", IN_PROGRESS: "In Progress", WAITING_CUSTOMER: "Waiting for Customer", RESOLVED: "Resolved", CLOSED: "Closed" };
const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
// SLA hours to first-resolution target, by priority
const SLA_HOURS: Record<string, number> = { URGENT: 4, HIGH: 8, MEDIUM: 24, LOW: 48 };

type TicketRow = Prisma.SupportTicketGetPayload<{}>;
type MessageRow = Prisma.SupportMessageGetPayload<{}>;

function shape(t: TicketRow, now = new Date()) {
  const open = t.status !== "RESOLVED" && t.status !== "CLOSED" && !t.deletedAt;
  return {
    id: t.id, number: t.number, subject: t.subject, description: t.description,
    category: t.category, priority: t.priority, priorityLabel: PRIORITY_LABEL[t.priority] || t.priority,
    status: t.status, statusLabel: STATUS_LABEL[t.status] || t.status,
    customerId: t.customerId, customerName: t.customerName, customerEmail: t.customerEmail, customerPhone: t.customerPhone,
    orderId: t.orderId, subscriptionId: t.subscriptionId,
    assigneeId: t.assigneeId, assigneeName: t.assigneeName,
    slaDueAt: t.slaDueAt, overdue: !!(open && t.slaDueAt && t.slaDueAt < now),
    firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt, resolutionNote: t.resolutionNote,
    mergedIntoId: t.mergedIntoId, tags: t.tags, deletedAt: t.deletedAt, createdAt: t.createdAt, updatedAt: t.updatedAt,
  };
}
function shapeMessage(m: MessageRow) {
  return { id: m.id, kind: m.kind, authorId: m.authorId, authorName: m.authorName, authorRole: m.authorRole, body: m.body, attachments: m.attachments, createdAt: m.createdAt };
}

// ---------------------------------------------------------------- schema
export const TicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().max(20000).optional().or(z.literal("")),
  category: z.string().trim().max(40).optional().or(z.literal("")),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  customerId: z.string().trim().max(60).optional().or(z.literal("")),
  customerName: z.string().trim().max(120).optional().or(z.literal("")),
  customerEmail: z.string().trim().max(160).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(30).optional().or(z.literal("")),
  orderId: z.string().trim().max(60).optional().or(z.literal("")),
  subscriptionId: z.string().trim().max(60).optional().or(z.literal("")),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
});
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };

async function nextNumber(): Promise<string> {
  const count = await db.supportTicket.count();
  let n = 2042 + count;
  for (let i = 0; i < 50; i++) {
    const num = `TK-${n}`;
    const dup = await db.supportTicket.findUnique({ where: { number: num }, select: { id: true } });
    if (!dup) return num;
    n++;
  }
  return `TK-${n}-${Date.now().toString(36)}`;
}
function slaFor(priority: string): Date {
  const h = SLA_HOURS[priority] ?? 24;
  return new Date(Date.now() + h * 3600 * 1000);
}

// ---------------------------------------------------------------- list + detail
export interface TicketFilters { q?: string; status?: string; priority?: string; category?: string; assignee?: string; customer?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number; includeDeleted?: boolean }
export async function listTickets(f: TicketFilters = {}) {
  const where: Prisma.SupportTicketWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.status) where.status = f.status as Prisma.EnumTicketStatusFilter["equals"];
  if (f.priority) where.priority = f.priority as Prisma.EnumTicketPriorityFilter["equals"];
  if (f.category) where.category = f.category;
  if (f.assignee) where.assigneeId = f.assignee;
  if (f.customer) where.customerId = f.customer;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ number: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { customerEmail: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }, { assigneeName: { contains: q, mode: "insensitive" } }]; }
  const orderBy: Prisma.SupportTicketOrderByWithRelationInput = f.sort === "priority" ? { priority: "desc" } : f.sort === "updated" ? { updatedAt: "desc" } : f.sort === "sla" ? { slaDueAt: "asc" } : { createdAt: "desc" };
  const total = await db.supportTicket.count({ where });
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  const rows = await db.supportTicket.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize });
  const now = new Date();
  return { tickets: rows.map((r) => shape(r, now)), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
export async function ticketDetail(id: string) {
  const t = await db.supportTicket.findFirst({ where: { OR: [{ id }, { number: id }] }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw new Error("Ticket not found");
  return { ...shape(t), messages: t.messages.map(shapeMessage) };
}

// ---------------------------------------------------------------- create + mutations
export async function createTicket(raw: unknown, actor: Actor) {
  const d = TicketSchema.parse(raw);
  const priority = d.priority ?? "MEDIUM";
  const number = await nextNumber();
  const t = await db.supportTicket.create({
    data: {
      number, subject: d.subject, description: clean(d.description), category: clean(d.category), priority, status: "OPEN",
      customerId: clean(d.customerId), customerName: clean(d.customerName), customerEmail: clean(d.customerEmail), customerPhone: clean(d.customerPhone),
      orderId: clean(d.orderId), subscriptionId: clean(d.subscriptionId), tags: d.tags ?? [], slaDueAt: slaFor(priority), createdById: actor.actorId ?? null,
    },
  });
  if (d.description && d.description.trim()) {
    await db.supportMessage.create({ data: { ticketId: t.id, kind: "reply", authorId: actor.actorId ?? null, authorName: d.customerName ?? "Customer", authorRole: "customer", body: d.description.trim() } });
  }
  await db.supportMessage.create({ data: { ticketId: t.id, kind: "system", authorName: actor.actorName ?? actor.actorRole ?? "System", body: `Ticket ${number} created (${PRIORITY_LABEL[priority]} priority).` } });
  return shape(t);
}
export async function updateTicket(id: string, raw: unknown) {
  const d = TicketSchema.partial().parse(raw);
  const data: Prisma.SupportTicketUpdateInput = {};
  if (d.subject !== undefined) data.subject = d.subject;
  if (d.description !== undefined) data.description = clean(d.description);
  for (const k of ["category", "customerName", "customerEmail", "customerPhone", "orderId", "subscriptionId"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = clean(d[k] as string);
  if (d.customerId !== undefined) data.customerId = clean(d.customerId);
  if (d.priority !== undefined) data.priority = d.priority;
  if (d.tags !== undefined) data.tags = d.tags;
  return shape(await db.supportTicket.update({ where: { id }, data }));
}
async function sys(ticketId: string, body: string, actor: Actor) {
  await db.supportMessage.create({ data: { ticketId, kind: "system", authorId: actor.actorId ?? null, authorName: actor.actorName ?? actor.actorRole ?? "System", authorRole: actor.actorRole ?? null, body } });
}
export async function assignTicket(id: string, assigneeId: string, assigneeName: string | undefined, actor: Actor) {
  const cur = await db.supportTicket.findUnique({ where: { id }, select: { status: true } });
  const data: Prisma.SupportTicketUpdateInput = { assigneeId: assigneeId || null, assigneeName: assigneeName ?? null };
  if (cur && cur.status === "OPEN" && assigneeId) data.status = "ASSIGNED";
  const t = await db.supportTicket.update({ where: { id }, data });
  await sys(id, assigneeId ? `Assigned to ${assigneeName || assigneeId}.` : "Unassigned.", actor);
  return shape(t);
}
export async function changePriority(id: string, priority: string, actor: Actor) {
  const t = await db.supportTicket.update({ where: { id }, data: { priority: priority as TicketRow["priority"] } });
  await sys(id, `Priority changed to ${PRIORITY_LABEL[priority] || priority}.`, actor);
  return shape(t);
}
export async function changeStatus(id: string, status: string, actor: Actor) {
  const data: Prisma.SupportTicketUpdateInput = { status: status as TicketRow["status"] };
  if (status === "RESOLVED") data.resolvedAt = new Date();
  if (status === "CLOSED") data.closedAt = new Date();
  if (status === "OPEN") { data.resolvedAt = null; data.closedAt = null; }
  const t = await db.supportTicket.update({ where: { id }, data });
  await sys(id, `Status changed to ${STATUS_LABEL[status] || status}.`, actor);
  return shape(t);
}
export async function addMessage(id: string, kind: "reply" | "note", body: string, actor: Actor) {
  const cur = await db.supportTicket.findUnique({ where: { id }, select: { firstResponseAt: true, status: true } });
  if (!cur) throw new Error("Ticket not found");
  await db.supportMessage.create({ data: { ticketId: id, kind, authorId: actor.actorId ?? null, authorName: actor.actorName ?? actor.actorRole ?? "Staff", authorRole: actor.actorRole ?? null, body: body.trim() } });
  const patch: Prisma.SupportTicketUpdateInput = {};
  if (!cur.firstResponseAt && kind === "reply") patch.firstResponseAt = new Date();
  if (kind === "reply" && cur.status === "WAITING_CUSTOMER") patch.status = "IN_PROGRESS";
  if (Object.keys(patch).length) await db.supportTicket.update({ where: { id }, data: patch });
  return ticketDetail(id);
}
export async function closeTicket(id: string, resolutionNote: string | undefined, actor: Actor) {
  const t = await db.supportTicket.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), resolvedAt: new Date(), resolutionNote: resolutionNote?.trim() || undefined } });
  await sys(id, resolutionNote ? `Ticket closed — ${resolutionNote.trim()}` : "Ticket closed.", actor);
  return shape(t);
}
export async function reopenTicket(id: string, actor: Actor) {
  const t = await db.supportTicket.update({ where: { id }, data: { status: "OPEN", closedAt: null, resolvedAt: null } });
  await sys(id, "Ticket reopened.", actor);
  return shape(t);
}
export async function mergeTicket(id: string, intoId: string, actor: Actor) {
  const into = await db.supportTicket.findFirst({ where: { OR: [{ id: intoId }, { number: intoId }] }, select: { id: true, number: true } });
  if (!into) throw new Error("Target ticket not found");
  const t = await db.supportTicket.update({ where: { id }, data: { mergedIntoId: into.id, status: "CLOSED", closedAt: new Date() } });
  await sys(id, `Merged into ${into.number}.`, actor);
  return shape(t);
}
export const softDeleteTicket = async (id: string) => shape(await db.supportTicket.update({ where: { id }, data: { deletedAt: new Date() } }));
export const restoreTicket = async (id: string) => shape(await db.supportTicket.update({ where: { id }, data: { deletedAt: null } }));
export async function bulkTickets(action: string, ids: string[], actor: Actor) {
  if (action === "delete") return db.supportTicket.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } }).then((r) => ({ count: r.count }));
  if (action === "restore") return db.supportTicket.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } }).then((r) => ({ count: r.count }));
  if (["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"].includes(action)) {
    const extra: Prisma.SupportTicketUpdateManyMutationInput = { status: action as TicketRow["status"] };
    if (action === "RESOLVED") extra.resolvedAt = new Date();
    if (action === "CLOSED") extra.closedAt = new Date();
    return db.supportTicket.updateMany({ where: { id: { in: ids } }, data: extra }).then((r) => ({ count: r.count }));
  }
  throw new Error("Unknown bulk action");
}

// ---------------------------------------------------------------- dashboard + reports
export async function ticketDashboard() {
  const now = new Date();
  const [all, resolvedToday, respondedRows] = await Promise.all([
    db.supportTicket.findMany({ where: { deletedAt: null }, select: { status: true, priority: true, slaDueAt: true, createdAt: true, firstResponseAt: true } }),
    db.supportTicket.count({ where: { deletedAt: null, resolvedAt: { gte: soD(now) } } }),
    db.supportTicket.findMany({ where: { deletedAt: null, firstResponseAt: { not: null } }, select: { createdAt: true, firstResponseAt: true }, take: 500, orderBy: { createdAt: "desc" } }),
  ]);
  const openish = all.filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED");
  const count = (s: string) => all.filter((t) => t.status === s).length;
  const respMs = respondedRows.map((r) => (r.firstResponseAt!.getTime() - r.createdAt.getTime())).filter((x) => x >= 0);
  const avgRespH = respMs.length ? (respMs.reduce((a, b) => a + b, 0) / respMs.length) / 3600000 : 0;
  const resolvedClosed = all.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;
  return {
    kpis: {
      total: all.length, open: count("OPEN"), assigned: count("ASSIGNED"), inProgress: count("IN_PROGRESS"),
      waiting: count("WAITING_CUSTOMER"), resolved: count("RESOLVED"), closed: count("CLOSED"),
      unresolved: openish.length, highPriority: openish.filter((t) => t.priority === "HIGH" || t.priority === "URGENT").length,
      overdue: openish.filter((t) => t.slaDueAt && t.slaDueAt < now).length,
      resolvedToday, avgFirstResponseHours: Math.round(avgRespH * 10) / 10,
      resolutionRate: all.length ? Math.round((resolvedClosed / all.length) * 100) : 0,
    },
  };
}
export async function ticketReports(f: { from?: string; to?: string } = {}) {
  const where: Prisma.SupportTicketWhereInput = { deletedAt: null };
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  const rows = await db.supportTicket.findMany({ where, select: { status: true, priority: true, category: true, assigneeName: true } });
  const tally = (key: (t: typeof rows[number]) => string | null) => { const m: Record<string, number> = {}; rows.forEach((t) => { const k = key(t) || "—"; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count); };
  return {
    total: rows.length,
    byStatus: tally((t) => STATUS_LABEL[t.status] || t.status),
    byPriority: tally((t) => PRIORITY_LABEL[t.priority] || t.priority),
    byCategory: tally((t) => t.category),
    byAssignee: tally((t) => t.assigneeName),
  };
}
