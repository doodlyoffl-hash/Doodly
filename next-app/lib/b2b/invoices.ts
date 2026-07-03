/* =============================================================
   Business Invoices — service layer (Prisma, server-only).
   Invoices are 1:1 with a B2B order; amounts/items derive from the
   order, payments from BusinessPayment. Adds invoice status, due
   date, void, notes/terms and an append-only audit trail.
   Admin / Super-Admin only (enforced at the API layer).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatInvoiceNumber } from "./engine";
import { recordPayment } from "./service";

interface Actor { actorId?: string; actorRole?: string; ip?: string }

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; const c = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : ""; if (c === "P2034" || c === "P2037" || c === "P2002") { await sleep(40 * (i + 1)); continue; } throw e; } }
  throw last;
}
async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}
const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

export async function logInvoiceEvent(tx: Prisma.TransactionClient, invoiceId: string, type: string, extra: { note?: string | null } & Actor = {}) {
  await tx.businessInvoiceEvent.create({ data: { invoiceId, type, note: extra.note ?? null, byId: extra.actorId ?? null, byRole: extra.actorRole ?? null, ip: extra.ip ?? null } });
}

export function dueDateFor(term: string, from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + (term === "WEEKLY" ? 7 : term === "MONTHLY" ? 30 : term === "CREDIT" ? 15 : 0));
  return d;
}

/** Derived payment status (Paid / Partial / Pending / Overdue / Void). */
export function paymentStatusOf(totalPaise: number, paidPaise: number, dueDate: Date | null, status: string): string {
  if (status === "VOID") return "VOID";
  if (paidPaise >= totalPaise && totalPaise > 0) return "PAID";
  const overdue = dueDate ? new Date(dueDate) < new Date() : false;
  if (paidPaise > 0) return overdue ? "OVERDUE" : "PARTIAL";
  return overdue ? "OVERDUE" : "PENDING";
}

type InvWithOrder = Prisma.BusinessInvoiceGetPayload<{ include: { order: { include: { business: { select: { code: true; name: true; gst: true } }; items: { select: { productName: true; quantity: true; unit: true } } } }; events: { select: { createdAt: true } } } }>;
function shapeRow(inv: InvWithOrder) {
  const o = inv.order;
  return {
    id: inv.id, number: inv.number, businessCode: o.business.code, businessName: o.business.name, gst: o.business.gst,
    orderCode: o.code, issuedAt: inv.issuedAt.toISOString(), dueDate: inv.dueDate?.toISOString() ?? null,
    status: inv.status, paymentStatus: paymentStatusOf(o.totalPaise, o.paidPaise, inv.dueDate, inv.status),
    totalPaise: o.totalPaise, paidPaise: o.paidPaise, gstPaise: inv.gstPaise,
    itemsSummary: o.items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).slice(0, 3).join(", "),
    lastUpdated: (inv.events.at(-1)?.createdAt ?? inv.issuedAt).toISOString(),
  };
}

// ---------- list ----------

export type InvoiceSort = "latest" | "oldest" | "amount_desc" | "amount_asc" | "business" | "due";
export async function listInvoices(args: {
  status?: string; businessId?: string; productSlug?: string; q?: string;
  from?: string; to?: string; amountFromPaise?: number; amountToPaise?: number; overdue?: boolean;
  sort?: InvoiceSort; limit?: number; offset?: number;
} = {}) {
  const where: Prisma.BusinessInvoiceWhereInput = {};
  if (args.status) where.status = args.status as never;
  if (args.businessId) where.businessId = args.businessId;
  if (args.from || args.to) where.issuedAt = { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(`${args.to}T23:59:59`) } : {}) };
  if (args.overdue) { where.status = { in: ["ISSUED", "PARTIAL"] }; where.dueDate = { lt: new Date() }; }
  const orderConds: Prisma.BusinessOrderWhereInput = {};
  if (args.amountFromPaise != null || args.amountToPaise != null) orderConds.totalPaise = { ...(args.amountFromPaise != null ? { gte: args.amountFromPaise } : {}), ...(args.amountToPaise != null ? { lte: args.amountToPaise } : {}) };
  if (args.productSlug) orderConds.items = { some: { productSlug: args.productSlug } };
  if (args.q?.trim()) {
    const s = args.q.trim();
    where.OR = [
      { number: { contains: s, mode: "insensitive" } },
      { order: { code: { contains: s, mode: "insensitive" } } },
      { order: { business: { code: { contains: s, mode: "insensitive" } } } },
      { order: { business: { name: { contains: s, mode: "insensitive" } } } },
      { order: { business: { gst: { contains: s, mode: "insensitive" } } } },
    ];
  }
  if (Object.keys(orderConds).length) where.order = { is: orderConds };

  const orderBy: Prisma.BusinessInvoiceOrderByWithRelationInput =
    args.sort === "oldest" ? { issuedAt: "asc" }
    : args.sort === "amount_desc" ? { order: { totalPaise: "desc" } }
    : args.sort === "amount_asc" ? { order: { totalPaise: "asc" } }
    : args.sort === "business" ? { order: { business: { name: "asc" } } }
    : args.sort === "due" ? { dueDate: "asc" }
    : { issuedAt: "desc" };
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const offset = Math.max(args.offset ?? 0, 0);
  const include = { order: { include: { business: { select: { code: true, name: true, gst: true } }, items: { select: { productName: true, quantity: true, unit: true } } } }, events: { select: { createdAt: true } } } as const;
  const [rows, total] = await Promise.all([
    db.businessInvoice.findMany({ where, orderBy, take: limit, skip: offset, include }),
    db.businessInvoice.count({ where }),
  ]);
  return { invoices: rows.map(shapeRow), total, limit, offset };
}

export async function getInvoiceDetail(id: string) {
  const inv = await db.businessInvoice.findUnique({
    where: { id },
    include: {
      order: { include: { business: true, items: true, payments: { orderBy: { createdAt: "desc" } } } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!inv) return null;
  const o = inv.order;
  return {
    id: inv.id, number: inv.number, status: inv.status, dueDate: inv.dueDate?.toISOString() ?? null, voidedAt: inv.voidedAt?.toISOString() ?? null,
    notes: inv.notes, terms: inv.terms, issuedAt: inv.issuedAt.toISOString(), gstPaise: inv.gstPaise,
    paymentStatus: paymentStatusOf(o.totalPaise, o.paidPaise, inv.dueDate, inv.status),
    order: { code: o.code, deliveryDate: o.deliveryDate.toISOString(), subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, taxPaise: o.taxPaise, totalPaise: o.totalPaise, paidPaise: o.paidPaise, paymentTerm: o.paymentTerm },
    business: { code: o.business.code, name: o.business.name, gst: o.business.gst, pan: o.business.pan, contactPerson: o.business.contactPerson, mobile: o.business.mobile, email: o.business.email, line1: o.business.line1, city: o.business.city, state: o.business.state, pincode: o.business.pincode, billingAddress: o.business.billingAddress },
    items: o.items.map((i) => ({ id: i.id, productName: i.productName, quantity: i.quantity, unit: i.unit, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
    payments: o.payments.map((p) => ({ id: p.id, amountPaise: p.amountPaise, method: p.method, reference: p.reference, createdAt: p.createdAt.toISOString() })),
    events: inv.events.map((e) => ({ id: e.id, type: e.type, note: e.note, byRole: e.byRole, createdAt: e.createdAt.toISOString() })),
  };
}

// ---------- create from an uninvoiced order ----------

export async function uninvoicedOrders() {
  const rows = await db.businessOrder.findMany({
    where: { invoice: null, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, code: true, totalPaise: true, deliveryDate: true, business: { select: { code: true, name: true } }, items: { select: { productName: true, quantity: true, unit: true } } },
  });
  return rows.map((o) => ({ id: o.id, code: o.code, totalPaise: o.totalPaise, deliveryDate: o.deliveryDate.toISOString(), businessCode: o.business.code, businessName: o.business.name, itemsSummary: o.items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).slice(0, 3).join(", ") }));
}

export async function createInvoiceForOrder(args: { orderId: string; dueDate?: string; notes?: string; terms?: string } & Actor) {
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const existing = await tx.businessInvoice.findUnique({ where: { orderId: args.orderId }, select: { id: true } });
      if (existing) throw new Error("This order already has an invoice.");
      const order = await tx.businessOrder.findUnique({ where: { id: args.orderId }, select: { businessId: true, taxPaise: true, paymentTerm: true, status: true } });
      if (!order) throw new Error("Order not found");
      if (order.status === "CANCELLED") throw new Error("Cannot invoice a cancelled order");
      const year = new Date().getFullYear();
      const number = formatInvoiceNumber(year, await nextSeq(tx, `b2binvoice:${year}`));
      const due = args.dueDate ? new Date(args.dueDate) : dueDateFor(order.paymentTerm, new Date());
      const inv = await tx.businessInvoice.create({ data: { number, orderId: args.orderId, businessId: order.businessId, gstPaise: order.taxPaise, status: "ISSUED", dueDate: due, notes: clean(args.notes), terms: clean(args.terms), createdById: args.actorId } });
      await logInvoiceEvent(tx, inv.id, "created", { note: `Invoice ${number} issued`, actorId: args.actorId, actorRole: args.actorRole, ip: args.ip });
      return inv;
    }, TX),
  );
}

export async function updateInvoice(id: string, patch: { dueDate?: string | null; notes?: string; terms?: string }, actor: Actor) {
  return db.$transaction(async (tx) => {
    const inv = await tx.businessInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "VOID") throw new Error("A voided invoice cannot be edited.");
    const updated = await tx.businessInvoice.update({ where: { id }, data: { ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}), ...(patch.notes !== undefined ? { notes: clean(patch.notes) } : {}), ...(patch.terms !== undefined ? { terms: clean(patch.terms) } : {}) } });
    await logInvoiceEvent(tx, id, "updated", { note: "Invoice details updated", actorId: actor.actorId, actorRole: actor.actorRole, ip: actor.ip });
    return updated;
  }, TX);
}

export async function voidInvoice(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const inv = await tx.businessInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "VOID") throw new Error("Invoice is already void.");
    const updated = await tx.businessInvoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date() } });
    await logInvoiceEvent(tx, id, "void", { note: "Invoice voided", actorId: actor.actorId, actorRole: actor.actorRole, ip: actor.ip });
    return updated;
  }, TX);
}

/** Record a payment against the invoice's order, then sync the invoice status. */
export async function recordInvoicePayment(id: string, args: { amountPaise: number; method: string; reference?: string; note?: string } & Actor) {
  const inv = await db.businessInvoice.findUnique({ where: { id }, select: { orderId: true, status: true } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "VOID") throw new Error("Cannot record a payment on a voided invoice.");
  await recordPayment({ orderId: inv.orderId, amountPaise: args.amountPaise, method: args.method, reference: args.reference, note: args.note, actorId: args.actorId, actorRole: args.actorRole });
  const order = await db.businessOrder.findUnique({ where: { id: inv.orderId }, select: { totalPaise: true, paidPaise: true } });
  const newStatus = order && order.paidPaise >= order.totalPaise ? "PAID" : "PARTIAL";
  return db.$transaction(async (tx) => {
    const updated = await tx.businessInvoice.update({ where: { id }, data: { status: newStatus } });
    await logInvoiceEvent(tx, id, "payment", { note: `₹${(args.amountPaise / 100).toFixed(2)} via ${args.method}`, actorId: args.actorId, actorRole: args.actorRole, ip: args.ip });
    return updated;
  }, TX);
}

export async function logInvoiceAction(id: string, type: "pdf" | "export", actor: Actor) {
  return db.$transaction((tx) => logInvoiceEvent(tx, id, type, { actorId: actor.actorId, actorRole: actor.actorRole, ip: actor.ip }));
}

// ---------- reports ----------

export async function invoiceReports(args: { from?: string; to?: string } = {}) {
  const where: Prisma.BusinessInvoiceWhereInput = {};
  if (args.from || args.to) where.issuedAt = { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(`${args.to}T23:59:59`) } : {}) };
  const rows = await db.businessInvoice.findMany({ where, select: { status: true, gstPaise: true, dueDate: true, order: { select: { totalPaise: true, paidPaise: true, business: { select: { id: true, code: true, name: true } } } } } });
  const live = rows.filter((r) => r.status !== "VOID");
  const now = new Date();
  const overdue = live.filter((r) => r.status !== "PAID" && r.dueDate && r.dueDate < now);
  const byBiz = new Map<string, { code?: string; name?: string; count: number; revenuePaise: number; outstandingPaise: number }>();
  for (const r of live) {
    const b = r.order.business; const k = b.id;
    const cur = byBiz.get(k) ?? { code: b.code, name: b.name, count: 0, revenuePaise: 0, outstandingPaise: 0 };
    cur.count++; cur.revenuePaise += r.order.totalPaise; cur.outstandingPaise += Math.max(0, r.order.totalPaise - r.order.paidPaise);
    byBiz.set(k, cur);
  }
  return {
    totalInvoices: rows.length,
    byStatus: rows.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}),
    revenueInvoicedPaise: live.reduce((s, r) => s + r.order.totalPaise, 0),
    collectedPaise: live.reduce((s, r) => s + r.order.paidPaise, 0),
    outstandingPaise: live.reduce((s, r) => s + Math.max(0, r.order.totalPaise - r.order.paidPaise), 0),
    gstPaise: live.reduce((s, r) => s + r.gstPaise, 0),
    overdueCount: overdue.length,
    overduePaise: overdue.reduce((s, r) => s + Math.max(0, r.order.totalPaise - r.order.paidPaise), 0),
    byBusiness: [...byBiz.values()].sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 10),
  };
}
