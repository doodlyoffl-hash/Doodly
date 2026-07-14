/* =============================================================
   B2B Order Management — service layer (Prisma, server-only).
   Atomic sequential IDs via Counter; transactional orders/payments;
   business lookup, profiles, reports. Admin / Super-Admin only
   (enforced at the API layer).
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { b2bProductBySlug } from "./catalog";
import { BusinessSchema, OrderSchema } from "./validation";
import {
  formatBusinessCode, formatOrderCode, formatInvoiceNumber, computeOrderTotals, lineTotalPaise,
  derivePaymentStatus, canTransitionStatus, B2B_STATUS_LABEL, type B2BOrderStatus,
} from "./engine";

interface Actor { actorId?: string; actorRole?: string }

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
      if (code === "P2034" || code === "P2037" || code === "P2002") { await sleep(40 * (i + 1)); continue; }
      throw e;
    }
  }
  throw last;
}

/** Atomic, gapless sequence. Safe under concurrency inside a Serializable tx. */
async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

/** Append an Order Status History / timeline event (in the caller's transaction). */
type EventType = "CREATED" | "STATUS" | "PAYMENT" | "INVOICE" | "NOTE" | "EDIT";
async function logEvent(
  tx: Prisma.TransactionClient, orderId: string, type: EventType,
  extra: { fromStatus?: B2BOrderStatus; toStatus?: B2BOrderStatus; note?: string | null; byId?: string } = {},
) {
  await tx.businessOrderEvent.create({
    data: { orderId, type, fromStatus: extra.fromStatus ?? null, toStatus: extra.toStatus ?? null, note: extra.note ?? null, byId: extra.byId ?? null },
  });
}
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

function mapBusiness(d: Prisma.JsonObject | Record<string, unknown>) {
  const b = d as Record<string, unknown>;
  return {
    name: b.name as string, type: b.type as never, contactPerson: b.contactPerson as string,
    mobile: String(b.mobile).replace(/[\s-]/g, ""), altMobile: clean(b.altMobile as string), email: clean(b.email as string),
    line1: b.line1 as string, landmark: clean(b.landmark as string), area: clean(b.area as string),
    city: (b.city as string) || "Vijayawada", state: (b.state as string) || "Andhra Pradesh", pincode: b.pincode as string,
    lat: (b.lat as number) ?? null, lng: (b.lng as number) ?? null,
    gst: clean(b.gst as string), pan: clean(b.pan as string), billingAddress: clean(b.billingAddress as string),
    paymentTerm: b.paymentTerm as never, discountBps: (b.discountBps as number) ?? 0, creditLimitPaise: (b.creditLimitPaise as number) ?? 0,
    preferredTime: clean(b.preferredTime as string), deliveryNotes: clean(b.deliveryNotes as string),
  };
}

// ---------- businesses ----------

export async function registerBusiness(raw: unknown, actor: Actor) {
  const data = BusinessSchema.parse(raw);
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const seq = await nextSeq(tx, "business");
      return tx.business.create({ data: { code: formatBusinessCode(seq), ...mapBusiness(data), createdById: actor.actorId } });
    }, TX),
  );
}

export async function updateBusiness(id: string, raw: unknown) {
  const data = BusinessSchema.partial().parse(raw);
  return db.business.update({ where: { id }, data: mapBusinessPartial(data) });
}
function mapBusinessPartial(d: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    if (k === "mobile" || k === "altMobile") out[k] = clean(String(v).replace(/[\s-]/g, ""));
    else if (typeof v === "string") out[k] = ["landmark", "area", "altMobile", "email", "gst", "pan", "billingAddress", "preferredTime", "deliveryNotes"].includes(k) ? clean(v) : v;
    else out[k] = v;
  }
  return out;
}

export async function setBusinessActive(id: string, active: boolean) {
  return db.business.update({ where: { id }, data: { active } });
}

/** Soft delete — super-admin only (enforced at the API). */
export async function softDeleteBusiness(id: string) {
  return db.business.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
}

export async function lookupBusinesses(q?: string, opts: { includeInactive?: boolean; limit?: number } = {}) {
  const where: Prisma.BusinessWhereInput = { deletedAt: null };
  if (!opts.includeInactive) where.active = true;
  if (q?.trim()) {
    const s = q.trim();
    where.OR = [
      { code: { contains: s, mode: "insensitive" } },
      { name: { contains: s, mode: "insensitive" } },
      { mobile: { contains: s.replace(/[\s-]/g, "") } },
      { gst: { contains: s, mode: "insensitive" } },
    ];
  }
  return db.business.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.limit ?? 50 });
}

export async function getBusinessProfile(id: string) {
  const business = await db.business.findUnique({ where: { id } });
  if (!business) return null;

  const [orders, agg, lastDelivered, items] = await Promise.all([
    db.businessOrder.findMany({
      where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, code: true, status: true, deliveryDate: true, totalPaise: true, paidPaise: true, paymentStatus: true, createdAt: true, remarks: true, invoice: { select: { number: true } }, items: { select: { productName: true, quantity: true, unit: true } } },
    }),
    db.businessOrder.aggregate({ where: { businessId: id, status: { not: "CANCELLED" } }, _count: true, _sum: { totalPaise: true, paidPaise: true } }),
    db.businessOrder.findFirst({ where: { businessId: id, status: { in: ["DELIVERED", "COMPLETED"] } }, orderBy: { deliveryDate: "desc" }, select: { deliveryDate: true } }),
    db.businessOrderItem.groupBy({ by: ["productName"], where: { order: { businessId: id, status: { not: "CANCELLED" } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 3 }),
  ]);

  const totalRevenue = agg._sum.totalPaise ?? 0;
  const outstandingPaise = (agg._sum.totalPaise ?? 0) - (agg._sum.paidPaise ?? 0);
  return {
    business,
    stats: {
      totalOrders: agg._count,
      totalRevenuePaise: totalRevenue,
      outstandingPaise,
      avgDailyQty: 0, // computed client-side from items if needed
      lastOrderAt: orders[0]?.createdAt ?? null,
      lastDeliveryAt: lastDelivered?.deliveryDate ?? null,
      preferredProducts: items.map((i) => ({ name: i.productName, qty: i._sum.quantity ?? 0 })),
    },
    orders,
  };
}

// ---------- orders ----------

/* The price MUST be resolved server-side from the (product, unit) pair.
   The admin UI prefills a price for the product's PRIMARY unit (milk = ₹66/Litre) and does
   not recompute it when the unit is switched, and the API previously accepted `unit` and
   `unitPricePaise` as independent free values — so ordering 20 "Bottles" of milk billed
   20 × ₹66 = ₹1,320 for what is 10 L (₹660 at the agreed rate). Double the money, driven
   purely by the unit label.
   Order of authority: the business's negotiated BusinessPricing row for that exact unit
   (highest applicable quantity slab) → the catalogue default, but ONLY for the primary unit
   → otherwise refuse, rather than silently reuse a price meant for a different unit. */
async function resolveUnitPricePaise(
  tx: Prisma.TransactionClient,
  businessId: string,
  item: { productSlug: string; productName: string; unit: string; quantity: number },
): Promise<number> {
  const now = new Date();
  const negotiated = await tx.businessPricing.findFirst({
    where: {
      businessId, productSlug: item.productSlug, unit: item.unit,
      active: true, deletedAt: null,
      minQty: { lte: Math.max(1, Math.floor(item.quantity)) },
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
    },
    orderBy: { minQty: "desc" },   // the most specific slab wins
    select: { b2bPricePaise: true },
  });
  if (negotiated) return negotiated.b2bPricePaise;

  const cat = b2bProductBySlug(item.productSlug);
  if (cat && item.unit === cat.primaryUnit && cat.defaultPricePaise > 0) return cat.defaultPricePaise;

  throw new Error(
    `No B2B price is set for ${item.productName} in ${item.unit}. Add a price for that unit in B2B Pricing (the catalogue default only covers ${cat?.primaryUnit ?? "the primary unit"}).`,
  );
}

export async function createOrder(raw: unknown, actor: Actor) {
  const data = OrderSchema.parse(raw);
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const biz = await tx.business.findUnique({ where: { id: data.businessId }, select: { paymentTerm: true, discountBps: true, deletedAt: true, active: true } });
      if (!biz || biz.deletedAt || !biz.active) throw new Error("Business not found or inactive");

      // Server-authoritative pricing — never trust the client's unitPricePaise.
      const priced = await Promise.all(
        data.items.map(async (i) => ({ ...i, unitPricePaise: await resolveUnitPricePaise(tx, data.businessId, i) })),
      );

      const discountBps = data.discountBps ?? biz.discountBps;
      const taxBps = data.taxBps ?? 0;
      const totals = computeOrderTotals(priced.map((i) => ({ unitPricePaise: i.unitPricePaise, quantity: i.quantity })), { discountBps, taxBps });
      const year = new Date(data.deliveryDate).getFullYear() || new Date().getFullYear();
      const code = formatOrderCode(year, await nextSeq(tx, `b2border:${year}`));

      const order = await tx.businessOrder.create({
        data: {
          code, businessId: data.businessId, deliveryDate: new Date(data.deliveryDate), deliveryTime: data.deliveryTime,
          deliveryNotes: clean(data.deliveryNotes), ...totals, paymentTerm: biz.paymentTerm,
          paymentStatus: derivePaymentStatus(totals.totalPaise, 0, biz.paymentTerm), remarks: clean(data.remarks), createdById: actor.actorId,
          items: { create: priced.map((i) => ({ productSlug: i.productSlug, productName: i.productName, quantity: i.quantity, unit: i.unit, unitPricePaise: i.unitPricePaise, lineTotalPaise: lineTotalPaise(i.unitPricePaise, i.quantity) })) },
        },
        include: { items: true, business: { select: { code: true, name: true } } },
      });
      await logEvent(tx, order.id, "CREATED", { toStatus: "PENDING", byId: actor.actorId, note: `Order created · ${data.items.length} item(s) · ${rupees(totals.totalPaise)}` });
      return order;
    }, TX),
  );
}

type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "CREDIT";
export async function listOrders(args: { status?: B2BOrderStatus; businessId?: string; q?: string; from?: string; to?: string; paymentStatus?: PaymentStatus; limit?: number; offset?: number } = {}) {
  const where: Prisma.BusinessOrderWhereInput = {};
  if (args.status) where.status = args.status;
  if (args.businessId) where.businessId = args.businessId;
  if (args.paymentStatus) where.paymentStatus = args.paymentStatus;
  if (args.from || args.to) where.deliveryDate = { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(args.to) } : {}) };
  if (args.q?.trim()) {
    const s = args.q.trim();
    where.OR = [
      { code: { contains: s, mode: "insensitive" } },
      { business: { name: { contains: s, mode: "insensitive" } } },
      { business: { code: { contains: s, mode: "insensitive" } } },
      { items: { some: { productName: { contains: s, mode: "insensitive" } } } }, // search by product
    ];
  }
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  const offset = Math.max(args.offset ?? 0, 0);
  const [orders, total] = await Promise.all([
    db.businessOrder.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit, skip: offset,
      select: { id: true, code: true, status: true, deliveryDate: true, deliveryTime: true, totalPaise: true, paidPaise: true, paymentStatus: true, createdAt: true, business: { select: { code: true, name: true } }, items: { select: { productName: true, quantity: true, unit: true } } },
    }),
    db.businessOrder.count({ where }),
  ]);
  return { orders, total, limit, offset };
}

/** Edit a Pending/Confirmed order — replace items, recompute totals, reset paymentStatus. */
export async function updateOrder(id: string, raw: unknown, actor: Actor) {
  const data = OrderSchema.parse(raw);
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const cur = await tx.businessOrder.findUnique({ where: { id }, select: { status: true, paidPaise: true, paymentTerm: true, businessId: true } });
      if (!cur) throw new Error("Order not found");
      if (cur.status !== "PENDING" && cur.status !== "CONFIRMED") throw new Error("Only Pending or Confirmed orders can be edited");
      const biz = await tx.business.findUnique({ where: { id: cur.businessId }, select: { discountBps: true } });
      const discountBps = data.discountBps ?? biz?.discountBps ?? 0;
      const taxBps = data.taxBps ?? 0;
      const totals = computeOrderTotals(data.items.map((i) => ({ unitPricePaise: i.unitPricePaise, quantity: i.quantity })), { discountBps, taxBps });
      await tx.businessOrderItem.deleteMany({ where: { orderId: id } });
      const updated = await tx.businessOrder.update({
        where: { id },
        data: {
          deliveryDate: new Date(data.deliveryDate), deliveryTime: data.deliveryTime, deliveryNotes: clean(data.deliveryNotes),
          ...totals, paymentStatus: derivePaymentStatus(totals.totalPaise, cur.paidPaise, cur.paymentTerm), remarks: clean(data.remarks),
          items: { create: data.items.map((i) => ({ productSlug: i.productSlug, productName: i.productName, quantity: i.quantity, unit: i.unit, unitPricePaise: i.unitPricePaise, lineTotalPaise: lineTotalPaise(i.unitPricePaise, i.quantity) })) },
        },
        include: { items: true },
      });
      await logEvent(tx, id, "EDIT", { byId: actor.actorId, note: `Order edited · ${data.items.length} item(s) · ${rupees(totals.totalPaise)}` });
      return updated;
    }, TX),
  );
}

/** Append a free-text internal note to the order timeline. */
export async function addOrderNote(args: { id: string; note: string } & Actor) {
  const note = args.note.trim();
  if (!note) throw new Error("Note is empty");
  if (note.length > 500) throw new Error("Note is too long");
  return db.$transaction(async (tx) => {
    const order = await tx.businessOrder.findUnique({ where: { id: args.id }, select: { id: true } });
    if (!order) throw new Error("Order not found");
    await logEvent(tx, args.id, "NOTE", { byId: args.actorId, note });
    return { ok: true };
  }, TX);
}

export async function updateOrderStatus(args: { id: string; status: B2BOrderStatus } & Actor) {
  return db.$transaction(async (tx) => {
    const cur = await tx.businessOrder.findUnique({ where: { id: args.id }, select: { status: true } });
    if (!cur) throw new Error("Order not found");
    if (cur.status !== args.status && !canTransitionStatus(cur.status as B2BOrderStatus, args.status)) {
      throw new Error(`Cannot move from ${B2B_STATUS_LABEL[cur.status as B2BOrderStatus]} to ${B2B_STATUS_LABEL[args.status]}`);
    }
    const updated = await tx.businessOrder.update({ where: { id: args.id }, data: { status: args.status } });
    await logEvent(tx, args.id, "STATUS", { fromStatus: cur.status as B2BOrderStatus, toStatus: args.status, byId: args.actorId });
    return updated;
  }, TX);
}

export async function cancelOrder(args: { id: string } & Actor) {
  return db.$transaction(async (tx) => {
    const cur = await tx.businessOrder.findUnique({ where: { id: args.id }, select: { status: true } });
    if (!cur) throw new Error("Order not found");
    const updated = await tx.businessOrder.update({ where: { id: args.id }, data: { status: "CANCELLED" } });
    await logEvent(tx, args.id, "STATUS", { fromStatus: cur.status as B2BOrderStatus, toStatus: "CANCELLED", byId: args.actorId, note: "Cancelled" });
    return updated;
  }, TX);
}

/** Duplicate an order as a fresh PENDING order (delivery date = tomorrow). */
export async function reorder(args: { id: string } & Actor) {
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const src = await tx.businessOrder.findUnique({ where: { id: args.id }, include: { items: true } });
      if (!src) throw new Error("Order not found");
      const deliveryDate = new Date(); deliveryDate.setDate(deliveryDate.getDate() + 1);
      const year = deliveryDate.getFullYear();
      const code = formatOrderCode(year, await nextSeq(tx, `b2border:${year}`));
      return tx.businessOrder.create({
        data: {
          code, businessId: src.businessId, deliveryDate, deliveryTime: src.deliveryTime, deliveryNotes: src.deliveryNotes,
          subtotalPaise: src.subtotalPaise, discountPaise: src.discountPaise, taxPaise: src.taxPaise, totalPaise: src.totalPaise,
          paymentTerm: src.paymentTerm, paymentStatus: derivePaymentStatus(src.totalPaise, 0, src.paymentTerm), remarks: src.remarks, createdById: args.actorId,
          items: { create: src.items.map((i) => ({ productSlug: i.productSlug, productName: i.productName, quantity: i.quantity, unit: i.unit, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })) },
        },
        include: { items: true },
      });
    }, TX),
  );
}

export async function getOrder(id: string) {
  return db.businessOrder.findUnique({ where: { id }, include: { items: true, business: true, payments: { orderBy: { createdAt: "desc" } }, invoice: true, events: { orderBy: { createdAt: "asc" } } } });
}

// ---------- payments + invoices ----------

export async function recordPayment(args: { orderId: string; amountPaise: number; method: string; reference?: string; note?: string } & Actor) {
  if (args.amountPaise <= 0) throw new Error("Amount must be positive");
  return db.$transaction(async (tx) => {
    const order = await tx.businessOrder.findUnique({ where: { id: args.orderId }, select: { businessId: true, totalPaise: true, paidPaise: true, paymentTerm: true } });
    if (!order) throw new Error("Order not found");
    await tx.businessPayment.create({ data: { businessId: order.businessId, orderId: args.orderId, amountPaise: args.amountPaise, method: args.method, reference: clean(args.reference), note: clean(args.note), recordedById: args.actorId } });
    const paidPaise = order.paidPaise + args.amountPaise;
    const updated = await tx.businessOrder.update({ where: { id: args.orderId }, data: { paidPaise, paymentStatus: derivePaymentStatus(order.totalPaise, paidPaise, order.paymentTerm) } });
    await logEvent(tx, args.orderId, "PAYMENT", { byId: args.actorId, note: `${rupees(args.amountPaise)} via ${args.method}${args.reference ? ` (${args.reference})` : ""}` });
    return updated;
  }, TX);
}

export async function generateInvoice(args: { orderId: string } & Actor) {
  const { inv, created } = await withRetry(() =>
    db.$transaction(async (tx) => {
      const existing = await tx.businessInvoice.findUnique({ where: { orderId: args.orderId } });
      if (existing) return { inv: existing, created: false };
      const order = await tx.businessOrder.findUnique({ where: { id: args.orderId }, select: { businessId: true, taxPaise: true, paymentTerm: true } });
      if (!order) throw new Error("Order not found");
      const year = new Date().getFullYear();
      const number = formatInvoiceNumber(year, await nextSeq(tx, `b2binvoice:${year}`));
      const due = new Date();
      due.setDate(due.getDate() + (order.paymentTerm === "WEEKLY" ? 7 : order.paymentTerm === "MONTHLY" ? 30 : order.paymentTerm === "CREDIT" ? 15 : 0));
      const row = await tx.businessInvoice.create({ data: { number, orderId: args.orderId, businessId: order.businessId, gstPaise: order.taxPaise, status: "ISSUED", dueDate: due, createdById: args.actorId } });
      await logEvent(tx, args.orderId, "INVOICE", { byId: args.actorId, note: `Invoice ${row.number}` });
      await tx.businessInvoiceEvent.create({ data: { invoiceId: row.id, type: "created", note: `Invoice ${row.number} issued`, byId: args.actorId, byRole: args.actorRole } });
      return { inv: row, created: true };
    }, TX),
  );
  // Auto-send the branded invoice email + PDF only for a freshly created invoice
  // (never on the idempotent re-return). Dynamic import breaks the import cycle.
  if (created) {
    try { const m = await import("./invoice-email"); await m.autoSendOnCreate(inv.id, { actorId: args.actorId, actorRole: args.actorRole }); } catch { /* logged inside */ }
  }
  return inv;
}

// ---------- reports ----------

export async function b2bReports(args: { from?: string; to?: string } = {}) {
  const range: Prisma.DateTimeFilter = {};
  if (args.from) range.gte = new Date(args.from);
  if (args.to) range.lte = new Date(args.to);
  const where: Prisma.BusinessOrderWhereInput = { status: { not: "CANCELLED" }, ...(args.from || args.to ? { createdAt: range } : {}) };

  const [agg, byBusiness, byProduct, outstandingAgg, statusCounts] = await Promise.all([
    db.businessOrder.aggregate({ where, _count: true, _sum: { totalPaise: true, paidPaise: true } }),
    db.businessOrder.groupBy({ by: ["businessId"], where, _count: true, _sum: { totalPaise: true }, orderBy: { _sum: { totalPaise: "desc" } }, take: 10 }),
    db.businessOrderItem.groupBy({ by: ["productName"], where: { order: where }, _sum: { quantity: true, lineTotalPaise: true }, orderBy: { _sum: { lineTotalPaise: "desc" } }, take: 10 }),
    db.businessOrder.aggregate({ where: { status: { notIn: ["CANCELLED"] } }, _sum: { totalPaise: true, paidPaise: true } }),
    db.businessOrder.groupBy({ by: ["status"], where, _count: true }),
  ]);

  const bizIds = byBusiness.map((b) => b.businessId);
  const names = bizIds.length ? await db.business.findMany({ where: { id: { in: bizIds } }, select: { id: true, code: true, name: true } }) : [];
  const nameById = new Map(names.map((n) => [n.id, n]));

  return {
    totalOrders: agg._count,
    totalRevenuePaise: agg._sum.totalPaise ?? 0,
    collectedPaise: agg._sum.paidPaise ?? 0,
    outstandingPaise: (outstandingAgg._sum.totalPaise ?? 0) - (outstandingAgg._sum.paidPaise ?? 0),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    topBusinesses: byBusiness.map((b) => ({ code: nameById.get(b.businessId)?.code, name: nameById.get(b.businessId)?.name, orders: b._count, revenuePaise: b._sum.totalPaise ?? 0 })),
    topProducts: byProduct.map((p) => ({ name: p.productName, qty: p._sum.quantity ?? 0, revenuePaise: p._sum.lineTotalPaise ?? 0 })),
  };
}

export type BusinessProfile = Awaited<ReturnType<typeof getBusinessProfile>>;
export type B2BReports = Awaited<ReturnType<typeof b2bReports>>;
