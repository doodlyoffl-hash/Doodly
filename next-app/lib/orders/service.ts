/* =============================================================
   Customer Orders — service layer (Prisma, server-only).
   Every function is scoped to the signed-in userId (a customer can
   only ever touch their OWN orders). Timeline events power the order
   status history; cancel refunds to wallet; reorder duplicates items.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import type { OrderEventType, PaymentStatus, OrderType } from "@prisma/client";
import { db } from "@/lib/db";
import { sendInvoiceEmail } from "@/lib/auth/email";
import type { OrderFulfilment, OrderListItem, OrderDetail } from "./types";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const STOREFRONT = (process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://www.doodly.in").replace(/\/$/, "");
const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;

async function logEvent(tx: Prisma.TransactionClient, orderId: string, type: OrderEventType, title: string, note?: string | null) {
  await tx.orderEvent.create({ data: { orderId, type, title, note: note ?? null } });
}

/* Map the latest timeline event (+ cancel flag + delivery) to a fulfilment status. */
const EVENT_TO_FULFILMENT: Partial<Record<OrderEventType, OrderFulfilment>> = {
  CREATED: "PROCESSING", CONFIRMED: "CONFIRMED", PREPARING: "PREPARING", QUALITY_CHECK: "QUALITY_CHECK",
  PACKED: "PACKED", OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", ARRIVING: "ARRIVING", DELIVERED: "DELIVERED",
};
function fulfilmentFrom(cancelledAt: Date | null, events: { type: OrderEventType }[], deliveryStatus?: string | null): OrderFulfilment {
  if (cancelledAt) return "CANCELLED";
  for (const e of events) { const f = EVENT_TO_FULFILMENT[e.type]; if (f) return f; }
  // fall back to the linked delivery's status, then PROCESSING
  const map: Record<string, OrderFulfilment> = {
    SCHEDULED: "CONFIRMED", ASSIGNED: "CONFIRMED", ACCEPTED: "PREPARING", PACKED: "PACKED",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", ON_THE_WAY: "OUT_FOR_DELIVERY", REACHED: "ARRIVING", DELIVERED: "DELIVERED",
  };
  return (deliveryStatus && map[deliveryStatus]) || "PROCESSING";
}

// Customer-facing delivery stage — a friendly label that never exposes the executive's
// personal details (the spec: once assigned, the customer just sees that an executive is
// on it). Extensible toward live tracking later.
const DELIVERY_STAGE: Record<string, string> = {
  SCHEDULED: "Order confirmed", ASSIGNED: "Delivery Executive Assigned", ACCEPTED: "Preparing your order",
  PACKED: "Packed & ready", OUT_FOR_DELIVERY: "Out for delivery", ON_THE_WAY: "Out for delivery",
  REACHED: "Arriving now", DELIVERED: "Delivered", FAILED: "Delivery attempt failed", SKIPPED: "Skipped",
};
function customerDeliveryStage(status?: string | null): string {
  return (status && DELIVERY_STAGE[status]) || "Processing";
}

// ---------- list ----------

export type SortKey = "newest" | "oldest" | "amount_desc" | "amount_asc" | "delivery";
export async function listCustomerOrders(userId: string, args: {
  paymentStatus?: PaymentStatus; type?: OrderType; from?: string; to?: string; q?: string;
  cancelled?: boolean; sort?: SortKey; limit?: number; offset?: number;
} = {}): Promise<{ orders: OrderListItem[]; total: number; limit: number; offset: number }> {
  const where: Prisma.OrderWhereInput = { userId };
  if (args.paymentStatus) where.status = args.paymentStatus;
  if (args.type) where.type = args.type;
  if (args.cancelled === true) where.cancelledAt = { not: null };
  else if (args.cancelled === false) where.cancelledAt = null;
  if (args.from || args.to) where.createdAt = { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(`${args.to}T23:59:59`) } : {}) };
  if (args.q?.trim()) {
    const s = args.q.trim();
    where.OR = [
      { id: { contains: s.toLowerCase() } },                                  // by order number (suffix)
      { items: { some: { productName: { contains: s, mode: "insensitive" } } } }, // by product
    ];
  }
  const orderBy: Prisma.OrderOrderByWithRelationInput =
    args.sort === "oldest" ? { createdAt: "asc" }
    : args.sort === "amount_desc" ? { totalPaise: "desc" }
    : args.sort === "amount_asc" ? { totalPaise: "asc" }
    : args.sort === "delivery" ? { delivery: { date: "asc" } }
    : { createdAt: "desc" };

  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
  const offset = Math.max(args.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where, orderBy, take: limit, skip: offset,
      select: {
        id: true, type: true, status: true, cancelledAt: true, totalPaise: true, createdAt: true,
        delivery: { select: { status: true, date: true, slot: true } },
        invoice: { select: { number: true } },
        items: { select: { productName: true, quantity: true, variantLabel: true } },
        events: { where: { type: { not: "NOTE" } }, orderBy: { createdAt: "desc" }, take: 1, select: { type: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  const orders: OrderListItem[] = rows.map((o) => ({
    id: o.id,
    number: num(o.id),
    type: o.type,
    paymentStatus: o.status,
    fulfilment: fulfilmentFrom(o.cancelledAt, o.events, o.delivery?.status),
    cancelled: !!o.cancelledAt,
    totalPaise: o.totalPaise,
    createdAt: o.createdAt.toISOString(),
    itemsSummary: o.items.length
      ? o.items.slice(0, 3).map((i) => `${i.quantity}× ${i.productName}${i.variantLabel ? ` ${i.variantLabel}` : ""}`).join(", ")
      : o.type === "SAMPLE" ? "Trial Pack" : o.type === "SUBSCRIPTION" ? "Subscription delivery" : "—",
    itemCount: o.items.length,
    invoiceNumber: o.invoice?.number ?? null,
    deliveryDate: o.delivery?.date.toISOString() ?? null,
    deliverySlot: o.delivery?.slot ?? null,
    deliveryStage: o.delivery ? customerDeliveryStage(o.delivery.status) : null,
  }));
  return { orders, total, limit, offset };
}

// ---------- detail ----------

export async function getCustomerOrderDetail(userId: string, id: string): Promise<OrderDetail | null> {
  const o = await db.order.findFirst({
    where: { id, userId },
    include: {
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      delivery: { include: { driver: { include: { user: { select: { name: true, phone: true } } } }, address: true, subscription: { include: { address: true } } } },
      payment: true,
      invoice: true,
    },
  });
  if (!o) return null;
  // Self-heal: a paid order predating auto-generation gets its invoice on view (no email).
  if (o.status === "PAID" && !o.invoice) {
    try { await ensureInvoiceForOrder(o.id, { email: false }); o.invoice = await db.invoice.findUnique({ where: { orderId: o.id } }); } catch { /* non-blocking */ }
  }
  const [walletTxns, bottles] = await Promise.all([
    db.walletTxn.findMany({ where: { userId, orderId: id }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, kind: true, amountPaise: true, description: true, createdAt: true } }),
    o.delivery ? db.bottleLedger.findMany({ where: { userId, deliveryId: o.delivery.id }, orderBy: { createdAt: "desc" }, select: { id: true, event: true, qty: true, createdAt: true } }) : Promise.resolve([]),
  ]);

  // Prefer the delivery's own address snapshot (pinned history) over the live sub address.
  const addr = o.delivery?.address ?? o.delivery?.subscription?.address ?? null;
  return {
    id: o.id, number: num(o.id), type: o.type, paymentStatus: o.status,
    fulfilment: fulfilmentFrom(o.cancelledAt, [...o.events].reverse(), o.delivery?.status),
    cancelled: !!o.cancelledAt, createdAt: o.createdAt.toISOString(),
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, depositPaise: o.depositPaise, taxPaise: o.taxPaise, deliveryPaise: o.deliveryPaise, totalPaise: o.totalPaise,
    items: o.items.map((i) => ({ id: i.id, productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
    timeline: o.events.map((e) => ({ id: e.id, type: e.type, title: e.title, note: e.note, createdAt: e.createdAt.toISOString() })),
    delivery: o.delivery ? {
      status: o.delivery.status, stage: customerDeliveryStage(o.delivery.status),
      assigned: !!o.delivery.driver && o.delivery.status !== "DELIVERED",
      date: o.delivery.date.toISOString(), slot: o.delivery.slot, deliveredAt: o.delivery.deliveredAt?.toISOString() ?? null,
      driverName: o.delivery.driver?.user.name ?? null, driverPhone: o.delivery.driver?.user.phone ?? null,
      address: addr ? { line1: addr.line1, line2: addr.line2, city: addr.city, pincode: addr.pincode, lat: addr.lat, lng: addr.lng } : null,
    } : null,
    payment: o.payment ? { method: o.payment.method, status: o.payment.status, amountPaise: o.payment.amountPaise } : null,
    invoice: o.invoice ? { number: o.invoice.number, issuedAt: o.invoice.issuedAt.toISOString() } : null,
    walletTxns: walletTxns.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
    bottles: bottles.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
  };
}

// ---------- actions ----------

export async function reorderCustomer(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const src = await tx.order.findFirst({ where: { id, userId }, include: { items: true } });
    if (!src) throw new Error("Order not found");
    if (!src.items.length) throw new Error("This order has no items to reorder.");
    const order = await tx.order.create({
      data: {
        userId, type: "ONE_TIME", subtotalPaise: src.subtotalPaise, discountPaise: src.discountPaise, depositPaise: src.depositPaise,
        taxPaise: src.taxPaise, deliveryPaise: src.deliveryPaise, totalPaise: src.totalPaise, status: "PENDING",
        items: { create: src.items.map((i) => ({ productSlug: i.productSlug, productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })) },
      },
    });
    await logEvent(tx, order.id, "CREATED", "Order placed", `Reordered from ${num(src.id)}`);
    return { id: order.id, number: num(order.id) };
  }, TX);
}

const LOCKED_DELIVERY = new Set(["OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED"]);
const LOCKED_STAGE = new Set<OrderEventType>(["OUT_FOR_DELIVERY", "ARRIVING", "DELIVERED"]);
export async function cancelCustomerOrder(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id, userId },
      include: { delivery: true, events: { where: { type: { not: "NOTE" } }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) throw new Error("Order not found");
    if (order.cancelledAt) throw new Error("This order is already cancelled.");
    const stageLocked = order.events[0] && LOCKED_STAGE.has(order.events[0].type);
    const deliveryLocked = order.delivery && LOCKED_DELIVERY.has(order.delivery.status);
    if (stageLocked || deliveryLocked) throw new Error("This order is already on its way or delivered and can't be cancelled. Please contact support.");

    await tx.order.update({ where: { id }, data: { cancelledAt: new Date() } });
    if (order.delivery) await tx.delivery.update({ where: { id: order.delivery.id }, data: { status: "SKIPPED" } });
    await logEvent(tx, id, "CANCELLED", "Order cancelled", "Cancelled by you");

    // refund a paid order to the wallet
    // Refund only what was actually COLLECTED. Order.totalPaise is gross: the coupon
    // discount is stored separately and was never paid, so refunding totalPaise handed the
    // customer their discount back as spendable cash (buy with a coupon → cancel → keep it).
    // walletAppliedPaise stays in: that was a real debit from their wallet.
    const refundPaise = Math.max(0, order.totalPaise - (order.couponDiscountPaise ?? 0));
    if (order.status === "PAID" && refundPaise > 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { walletPaise: true } });
      const balanceAfterPaise = (user?.walletPaise ?? 0) + refundPaise;
      await tx.user.update({ where: { id: userId }, data: { walletPaise: balanceAfterPaise } });
      await tx.walletTxn.create({
        data: { userId, orderId: id, type: "CREDIT", kind: "refund", amountPaise: refundPaise, balanceAfterPaise,
          reference: `WTX-RF${id.slice(-7).toUpperCase()}`, description: `Refund for order ${num(id)}`, reason: "refund" },
      });
      await tx.order.update({ where: { id }, data: { status: "REFUNDED" } });
      await logEvent(tx, id, "REFUND", "Refunded to wallet", `${rupees(refundPaise)} credited to your wallet`);
    }
    return { ok: true };
  }, TX);
}

export async function reportOrderIssue(userId: string, id: string, issue: string) {
  const text = issue.trim();
  if (!text) throw new Error("Please describe the issue.");
  if (text.length > 500) throw new Error("That's too long.");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id, userId }, select: { id: true } });
    if (!order) throw new Error("Order not found");
    await logEvent(tx, id, "NOTE", "Issue reported", text);
    return { ok: true };
  }, TX);
}

export async function rateOrder(userId: string, id: string, rating: number, comment?: string) {
  const r = Math.round(rating);
  if (r < 1 || r > 5) throw new Error("Rating must be 1–5 stars.");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id, userId }, select: { id: true } });
    if (!order) throw new Error("Order not found");
    await logEvent(tx, id, "NOTE", "Delivery rated", `${"★".repeat(r)}${"☆".repeat(5 - r)}${comment?.trim() ? ` — ${comment.trim()}` : ""}`);
    return { ok: true };
  }, TX);
}

/**
 * Ensure a B2C Invoice exists for a PAID order. System-callable (no userId
 * scoping) so the payment webhook / verify callback / full-wallet checkout can
 * auto-generate it. Idempotent — returns the existing invoice if present and
 * no-ops for orders that aren't PAID yet. On first creation it emails the
 * customer their invoice (non-blocking, transactional). Safe to fire from
 * multiple paths (webhook + verify race).
 */
export async function ensureInvoiceForOrder(orderId: string, opts?: { email?: boolean }): Promise<{ number: string; created: boolean } | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, userId: true, status: true, taxPaise: true, totalPaise: true, createdAt: true,
      invoice: { select: { number: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!order) return null;
  if (order.invoice) return { number: order.invoice.number, created: false };
  if (order.status !== "PAID") return null;   // invoices are issued only once payment is confirmed

  const number = await db.$transaction(async (tx) => {
    // re-check inside the tx (webhook + verify can race)
    const again = await tx.order.findUnique({ where: { id: orderId }, select: { invoice: { select: { number: true } } } });
    if (again?.invoice) return again.invoice.number;
    const year = new Date().getFullYear();
    // continue past any seeded invoice numbers for the year
    const seqRow = await tx.counter.upsert({ where: { key: `invoice:${year}` }, create: { key: `invoice:${year}`, value: 1 }, update: { value: { increment: 1 } } });
    let seq = seqRow.value;
    for (let i = 0; i < 50; i++) {
      const n = `DOODLY/${year}/${String(seq).padStart(5, "0")}`;
      const clash = await tx.invoice.findUnique({ where: { number: n }, select: { id: true } });
      if (!clash) { await tx.invoice.create({ data: { number: n, userId: order.userId, orderId, gstPaise: order.taxPaise } }); return n; }
      seq = (await tx.counter.update({ where: { key: `invoice:${year}` }, data: { value: { increment: 1 } } })).value;
    }
    throw new Error("Could not allocate an invoice number.");
  }, TX);

  // Email the invoice (non-blocking). Transactional document → send it; the
  // sender no-ops safely if email isn't configured. Backfill of historical orders
  // passes { email: false } so old orders aren't re-emailed.
  try {
    if (opts?.email !== false && order.user?.email) {
      await sendInvoiceEmail(order.user.email, {
        name: order.user.name,
        invoiceNo: number,
        amount: rupees(order.totalPaise),
        date: order.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        downloadUrl: `${STOREFRONT}/account/invoices.html`,
      });
    }
  } catch (e) { console.error("invoice.email", (e as Error)?.message); }

  return { number, created: true };
}

/**
 * Backfill invoices for already-PAID orders that don't have one yet (e.g. orders
 * paid before auto-generation existed). No email (historical). Idempotent + bounded,
 * so it self-heals on the first read and is a no-op thereafter.
 */
export async function backfillInvoices(where: Prisma.OrderWhereInput, limit = 200): Promise<number> {
  const rows = await db.order.findMany({ where: { ...where, status: "PAID", invoice: null }, select: { id: true }, take: limit });
  for (const r of rows) { try { await ensureInvoiceForOrder(r.id, { email: false }); } catch { /* non-blocking */ } }
  return rows.length;
}

/** Customer-initiated (self-scoped) invoice generation — POST /api/orders/[id] {action:"invoice"}. */
export async function generateCustomerInvoice(userId: string, id: string) {
  const order = await db.order.findFirst({ where: { id, userId }, select: { id: true } });
  if (!order) throw new Error("Order not found");
  const r = await ensureInvoiceForOrder(id);
  if (!r) throw new Error("Your invoice will be ready once payment is confirmed.");
  return { number: r.number };
}
