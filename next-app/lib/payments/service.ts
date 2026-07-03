/* =============================================================
   DOODLY — Payments ledger service (Commerce → Payments)
   The canonical finance ledger across order / subscription /
   auto-pay / manual payments. Order `Payment` rows + paid
   `SubscriptionBilling` rows are synced in (backfill + forward).
   Money is integer paise. Every mutation appends a PaymentEvent.
   ============================================================= */
import "server-only";
import { Prisma, type PaymentMethod, type PaymentRecordStatus, type PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { adminCredit } from "@/lib/wallet/service";
import type {
  PaymentListResponse, PaymentListItem, PaymentStats, PaymentDetail, PaymentReports, GatewayRow,
} from "./types";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

type Tx = Prisma.TransactionClient;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(1); return x; };

async function nextSeq(tx: Tx, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}
const fmtCode = (n: number) => `PAY-${String(n).padStart(6, "0")}`;
const genRef = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

function mapStatus(s: PaymentStatus): PaymentRecordStatus {
  return s === "PAID" ? "SUCCESS" : s === "FAILED" ? "FAILED" : s === "REFUNDED" ? "REFUNDED" : "PENDING";
}

export async function logPaymentEvent(client: Tx | typeof db, paymentId: string, type: string, summary: string, detail: unknown, actor: Actor) {
  await client.paymentEvent.create({
    data: { paymentId, type, summary, detail: detail === undefined ? Prisma.JsonNull : (detail as Prisma.InputJsonValue), byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip },
  });
}

// ---------------------------------------------------------------- sync (backfill + forward)

/** Upsert a ledger record from an order `Payment`. Idempotent on (ORDER, orderId). */
export async function syncFromOrderPayment(orderPaymentId: string, actor: Actor = {}) {
  const p = await db.payment.findUnique({
    where: { id: orderPaymentId },
    select: { id: true, userId: true, orderId: true, method: true, amountPaise: true, status: true, razorpayOrderId: true, razorpayPayId: true, createdAt: true,
      order: { select: { invoice: { select: { number: true } } } } },
  });
  if (!p) return null;
  const existing = await db.paymentRecord.findFirst({ where: { source: "ORDER", orderId: p.orderId }, select: { id: true } });
  const data = {
    method: p.method, gateway: "razorpay", amountPaise: p.amountPaise, netPaise: p.amountPaise,
    status: mapStatus(p.status), gatewayOrderId: p.razorpayOrderId, gatewayPaymentId: p.razorpayPayId,
    invoiceNumber: p.order?.invoice?.number ?? null, transactionId: p.razorpayPayId ?? null,
  };
  if (existing) { await db.paymentRecord.update({ where: { id: existing.id }, data }); return existing.id; }
  const rec = await db.$transaction(async (tx) => {
    const code = fmtCode(await nextSeq(tx, "payment"));
    const created = await tx.paymentRecord.create({ data: { code, source: "ORDER", userId: p.userId, orderId: p.orderId, createdAt: p.createdAt, ...data } });
    await logPaymentEvent(tx, created.id, p.status === "PAID" ? "SUCCESS" : "CREATED", `Order payment ${p.status.toLowerCase()}`, { orderId: p.orderId }, actor);
    return created;
  });
  return rec.id;
}

/** Upsert a ledger record from a `SubscriptionBilling`. Idempotent on (billingId). */
export async function syncFromBilling(billingId: string, actor: Actor = {}) {
  const b = await db.subscriptionBilling.findUnique({
    where: { id: billingId },
    select: { id: true, userId: true, subscriptionId: true, autoPay: true, billingAmountPaise: true, discountPaise: true, gstPaise: true, walletUsedPaise: true, totalPaise: true, amountPaidPaise: true, paymentStatus: true, invoiceNumber: true, createdAt: true },
  });
  if (!b) return null;
  const status: PaymentRecordStatus = b.paymentStatus === "PAID" ? "SUCCESS" : b.paymentStatus === "FAILED" ? "FAILED" : b.paymentStatus === "REFUNDED" ? "REFUNDED" : "PENDING";
  const existing = await db.paymentRecord.findFirst({ where: { billingId: b.id }, select: { id: true } });
  const data = {
    method: (b.walletUsedPaise >= b.totalPaise ? "WALLET" : "UPI") as PaymentMethod,
    gateway: b.walletUsedPaise >= b.totalPaise ? "wallet" : "razorpay",
    amountPaise: b.billingAmountPaise, discountPaise: b.discountPaise, gstPaise: b.gstPaise,
    walletUsedPaise: b.walletUsedPaise, netPaise: b.totalPaise, status, invoiceNumber: b.invoiceNumber,
  };
  if (existing) { await db.paymentRecord.update({ where: { id: existing.id }, data }); return existing.id; }
  const rec = await db.$transaction(async (tx) => {
    const code = fmtCode(await nextSeq(tx, "payment"));
    const created = await tx.paymentRecord.create({ data: { code, source: b.autoPay ? "AUTOPAY" : "SUBSCRIPTION", userId: b.userId, subscriptionId: b.subscriptionId, billingId: b.id, createdAt: b.createdAt, ...data } });
    await logPaymentEvent(tx, created.id, status === "SUCCESS" ? "SUCCESS" : "CREATED", `Subscription billing ${b.paymentStatus.toLowerCase()}`, { billingId: b.id }, actor);
    return created;
  });
  return rec.id;
}

// ---------------------------------------------------------------- stats

export async function paymentStats(): Promise<PaymentStats> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const [grouped, today, month, revenue, wallet, autopay, outstanding, total] = await Promise.all([
    db.paymentRecord.groupBy({ by: ["status"], _count: true }),
    db.paymentRecord.aggregate({ where: { status: "SUCCESS", createdAt: { gte: dayStart } }, _sum: { netPaise: true } }),
    db.paymentRecord.aggregate({ where: { status: "SUCCESS", createdAt: { gte: monthStart } }, _sum: { netPaise: true } }),
    db.paymentRecord.aggregate({ where: { status: "SUCCESS" }, _sum: { netPaise: true } }),
    db.paymentRecord.aggregate({ _sum: { walletUsedPaise: true } }),
    db.paymentRecord.aggregate({ where: { source: "AUTOPAY", status: "SUCCESS" }, _sum: { netPaise: true } }),
    db.paymentRecord.aggregate({ where: { status: { in: ["PENDING", "FAILED"] } }, _sum: { netPaise: true } }),
    db.paymentRecord.count(),
  ]);
  const c = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
  return {
    totalPayments: total,
    todaysCollectionsPaise: today._sum.netPaise ?? 0,
    monthlyCollectionsPaise: month._sum.netPaise ?? 0,
    successful: c("SUCCESS"),
    pending: c("PENDING"),
    failed: c("FAILED"),
    refunded: c("REFUNDED") + c("PARTIALLY_REFUNDED"),
    walletPaymentsPaise: wallet._sum.walletUsedPaise ?? 0,
    autopayCollectionsPaise: autopay._sum.netPaise ?? 0,
    outstandingPaise: outstanding._sum.netPaise ?? 0,
    totalRevenuePaise: revenue._sum.netPaise ?? 0,
  };
}

// ---------------------------------------------------------------- list

export interface ListArgs {
  status?: string; method?: string; gateway?: string; source?: string; walletUsed?: string; autopay?: string;
  dateFrom?: string; dateTo?: string; amountMin?: number; amountMax?: number; customerId?: string; q?: string;
  sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number;
}

export async function listPayments(args: ListArgs): Promise<PaymentListResponse> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(1000, Math.max(5, args.pageSize ?? 20));
  const and: Prisma.PaymentRecordWhereInput[] = [];

  if (args.status) and.push({ status: args.status as PaymentRecordStatus });
  if (args.method) and.push({ method: args.method as PaymentMethod });
  if (args.gateway) and.push({ gateway: args.gateway });
  if (args.source) and.push({ source: args.source as never });
  if (args.walletUsed === "1") and.push({ walletUsedPaise: { gt: 0 } });
  if (args.autopay === "1") and.push({ source: "AUTOPAY" });
  if (args.customerId) and.push({ userId: args.customerId });
  if (args.amountMin != null) and.push({ amountPaise: { gte: args.amountMin } });
  if (args.amountMax != null) and.push({ amountPaise: { lte: args.amountMax } });
  if (args.dateFrom || args.dateTo) {
    const r: Prisma.DateTimeFilter = {};
    if (args.dateFrom) r.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) r.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    and.push({ createdAt: r });
  }
  if (args.q?.trim()) {
    const q = args.q.trim();
    and.push({ OR: [
      { code: { contains: q, mode: "insensitive" } },
      { transactionId: { contains: q, mode: "insensitive" } },
      { orderId: { contains: q.toLowerCase() } },
      { subscriptionId: { contains: q.toLowerCase() } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
      { userId: { contains: q.toLowerCase() } },
    ] });
  }
  const where: Prisma.PaymentRecordWhereInput = and.length ? { AND: and } : {};

  const dir = args.dir ?? (args.sort === "customer" ? "asc" : "desc");
  const orderBy: Prisma.PaymentRecordOrderByWithRelationInput =
    args.sort === "amount" ? { amountPaise: dir }
    : args.sort === "customer" ? { user: { name: dir } }
    : { createdAt: dir };

  const [rows, total, methods, gateways] = await Promise.all([
    db.paymentRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { id: true, name: true, phone: true } } } }),
    db.paymentRecord.count({ where }),
    db.paymentRecord.findMany({ distinct: ["method"], select: { method: true } }),
    db.paymentRecord.findMany({ distinct: ["gateway"], select: { gateway: true } }),
  ]);

  const payments: PaymentListItem[] = rows.map((p) => ({
    id: p.id, code: p.code, transactionId: p.transactionId, source: p.source, status: p.status,
    customer: { id: p.user.id, name: p.user.name, phone: p.user.phone },
    orderId: p.orderId, subscriptionId: p.subscriptionId, invoiceNumber: p.invoiceNumber,
    method: p.method, gateway: p.gateway, amountPaise: p.amountPaise, walletUsedPaise: p.walletUsedPaise,
    gstPaise: p.gstPaise, discountPaise: p.discountPaise, netPaise: p.netPaise, refundedPaise: p.refundedPaise,
    collectedByName: p.collectedByName, reconciled: p.reconciled, createdAt: p.createdAt.toISOString(),
  }));
  return { payments, total, page, pageSize, facets: { methods: methods.map((m) => m.method), gateways: gateways.map((g) => g.gateway) } };
}

// ---------------------------------------------------------------- detail

export async function getPaymentDetail(id: string): Promise<PaymentDetail | null> {
  const p = await db.paymentRecord.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      refunds: { orderBy: { createdAt: "desc" } },
      attempts: { orderBy: { attemptNo: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  if (!p) return null;

  const [order, sub, billing, walletTxns] = await Promise.all([
    p.orderId ? db.order.findUnique({ where: { id: p.orderId }, select: { id: true, type: true, status: true, totalPaise: true } }) : null,
    p.subscriptionId ? db.subscription.findUnique({ where: { id: p.subscriptionId }, select: { id: true, status: true, plan: { select: { name: true } } } }) : null,
    p.billingId ? db.subscriptionBilling.findUnique({ where: { id: p.billingId }, select: { code: true, cycleNumber: true, paymentStatus: true } }) : null,
    db.walletTxn.findMany({ where: { userId: p.userId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, kind: true, amountPaise: true, description: true, createdAt: true } }),
  ]);

  return {
    id: p.id, code: p.code, transactionId: p.transactionId, source: p.source, status: p.status,
    customer: { id: p.user.id, name: p.user.name, email: p.user.email, phone: p.user.phone },
    order: order ? { id: order.id, type: order.type, status: order.status, totalPaise: order.totalPaise } : null,
    subscription: sub ? { id: sub.id, plan: sub.plan.name, status: sub.status } : null,
    billing: billing ? { code: billing.code, cycleNumber: billing.cycleNumber, paymentStatus: billing.paymentStatus } : null,
    method: p.method, gateway: p.gateway, amountPaise: p.amountPaise, walletUsedPaise: p.walletUsedPaise,
    gstPaise: p.gstPaise, discountPaise: p.discountPaise, netPaise: p.netPaise, refundedPaise: p.refundedPaise,
    refundablePaise: Math.max(0, p.netPaise - p.refundedPaise),
    invoiceNumber: p.invoiceNumber, collectedByName: p.collectedByName, reconciled: p.reconciled, notes: p.notes,
    gatewayOrderId: p.gatewayOrderId, gatewayPaymentId: p.gatewayPaymentId, gatewayResponse: p.gatewayResponse,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    walletTxns: walletTxns.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
    refunds: p.refunds.map((r) => ({ id: r.id, amountPaise: r.amountPaise, reason: r.reason, toWallet: r.toWallet, status: r.status, reference: r.reference, createdAt: r.createdAt.toISOString() })),
    attempts: p.attempts.map((a) => ({ id: a.id, attemptNo: a.attemptNo, status: a.status, gatewayRef: a.gatewayRef, error: a.error, createdAt: a.createdAt.toISOString() })),
    events: p.events.map((e) => ({ id: e.id, type: e.type, summary: e.summary, detail: e.detail, byRole: e.byRole, createdAt: e.createdAt.toISOString() })),
  };
}

// ---------------------------------------------------------------- record manual payment

export interface RecordArgs {
  userId: string; amountPaise: number; method: PaymentMethod; gateway?: string;
  orderId?: string; subscriptionId?: string; billingId?: string;
  walletUsedPaise?: number; gstPaise?: number; discountPaise?: number;
  reference?: string; invoiceNumber?: string; notes?: string; markPaid?: boolean;
}

export async function recordManualPayment(args: RecordArgs, actor: Actor) {
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { id: true, name: true } });
  if (!user) throw Errors.notFound("Customer not found.");
  if (args.amountPaise <= 0) throw Errors.badRequest("Amount must be positive.");
  if (args.reference) {
    const dup = await db.paymentRecord.findUnique({ where: { transactionId: args.reference }, select: { id: true } });
    if (dup) throw Errors.conflict("A payment with that reference already exists.");
  }
  // duplicate-cycle guard: a SUCCESS payment already exists for this billing/order
  if (args.billingId) { const ex = await db.paymentRecord.findFirst({ where: { billingId: args.billingId, status: "SUCCESS" }, select: { id: true } }); if (ex) throw Errors.conflict("This billing cycle is already paid."); }

  const wallet = Math.max(0, args.walletUsedPaise ?? 0);
  const net = Math.max(0, args.amountPaise - wallet);
  const collectedBy = actor.actorRole ? `${actor.actorRole}` : "staff";

  const rec = await db.$transaction(async (tx) => {
    const code = fmtCode(await nextSeq(tx, "payment"));
    const created = await tx.paymentRecord.create({
      data: {
        code, transactionId: args.reference ?? null, source: "MANUAL", userId: args.userId,
        orderId: args.orderId, subscriptionId: args.subscriptionId, billingId: args.billingId,
        method: args.method, gateway: args.gateway ?? (args.method === "CASH" ? "cash" : "manual"),
        amountPaise: args.amountPaise, walletUsedPaise: wallet, gstPaise: args.gstPaise ?? 0, discountPaise: args.discountPaise ?? 0,
        netPaise: net, status: "SUCCESS", invoiceNumber: args.invoiceNumber, notes: args.notes,
        collectedById: actor.actorId, collectedByName: collectedBy, createdById: actor.actorId,
      },
    });
    await logPaymentEvent(tx, created.id, "SUCCESS", `Manual payment recorded (${args.method})`, { amountPaise: args.amountPaise, reference: args.reference ?? null }, actor);
    // optionally mark the linked order/billing paid
    if (args.markPaid && args.orderId) await tx.order.update({ where: { id: args.orderId }, data: { status: "PAID" } }).catch(() => {});
    if (args.markPaid && args.billingId) await tx.subscriptionBilling.update({ where: { id: args.billingId }, data: { paymentStatus: "PAID", amountPaidPaise: args.amountPaise } }).catch(() => {});
    return created;
  });
  return { id: rec.id, code: rec.code };
}

// ---------------------------------------------------------------- refund

export async function processRefund(id: string, p: { amountPaise: number; reason?: string; toWallet?: boolean }, actor: Actor) {
  const rec = await db.paymentRecord.findUnique({ where: { id }, select: { id: true, userId: true, netPaise: true, refundedPaise: true, status: true, orderId: true, billingId: true } });
  if (!rec) throw Errors.notFound("Payment not found.");
  if (rec.status === "PENDING" || rec.status === "FAILED") throw Errors.badRequest("Only a successful payment can be refunded.");
  const refundable = rec.netPaise - rec.refundedPaise;
  if (p.amountPaise <= 0) throw Errors.badRequest("Refund amount must be positive.");
  if (p.amountPaise > refundable) throw Errors.badRequest(`Refund exceeds the refundable balance (₹${Math.round(refundable / 100)}).`);

  const newRefunded = rec.refundedPaise + p.amountPaise;
  const fully = newRefunded >= rec.netPaise;

  const result = await db.$transaction(async (tx) => {
    let reference = genRef("RFND");
    for (let i = 0; i < 5; i++) { const c = await tx.paymentRefund.findUnique({ where: { reference }, select: { id: true } }); if (!c) break; reference = genRef("RFND"); }
    await tx.paymentRefund.create({ data: { paymentId: id, amountPaise: p.amountPaise, reason: p.reason, toWallet: !!p.toWallet, status: "PROCESSED", reference, byId: actor.actorId, byRole: actor.actorRole } });
    await tx.paymentRecord.update({ where: { id }, data: { refundedPaise: newRefunded, status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    if (rec.orderId && fully) await tx.order.update({ where: { id: rec.orderId }, data: { status: "REFUNDED" } }).catch(() => {});
    if (rec.billingId && fully) await tx.subscriptionBilling.update({ where: { id: rec.billingId }, data: { paymentStatus: "REFUNDED" } }).catch(() => {});
    await logPaymentEvent(tx, id, "REFUND", `${fully ? "Full" : "Partial"} refund ₹${Math.round(p.amountPaise / 100)}${p.toWallet ? " to wallet" : ""}${p.reason ? ` — ${p.reason}` : ""}`, { amountPaise: p.amountPaise, toWallet: !!p.toWallet, reference }, actor);
    await tx.notification.create({ data: { userId: rec.userId, channel: "PUSH", title: "Refund processed", body: `A refund of ₹${Math.round(p.amountPaise / 100)} has been processed${p.toWallet ? " to your DOODLY wallet" : ""}.`, sentAt: new Date() } });
    return { reference };
  });

  let walletBalance: number | null = null;
  if (p.toWallet) {
    const credit = await adminCredit({ userId: rec.userId, amountPaise: p.amountPaise, reason: "Payment refund", kind: "refund", actorId: actor.actorId, actorRole: actor.actorRole });
    walletBalance = credit.balancePaise;
    await logPaymentEvent(db, id, "WALLET", `Wallet credited ₹${Math.round(p.amountPaise / 100)} (refund)`, { reference: credit.txn.reference }, actor);
  }
  return { id, status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED", refundedPaise: newRefunded, reference: result.reference, walletBalance };
}

// ---------------------------------------------------------------- retry / reconcile / note

export async function retryPayment(id: string, actor: Actor) {
  const rec = await db.paymentRecord.findUnique({ where: { id }, select: { id: true, status: true, attempts: { select: { attemptNo: true }, orderBy: { attemptNo: "desc" }, take: 1 }, gateway: true } });
  if (!rec) throw Errors.notFound("Payment not found.");
  if (rec.status === "SUCCESS") throw Errors.badRequest("Payment already succeeded.");
  const attemptNo = (rec.attempts[0]?.attemptNo ?? 0) + 1;
  await db.$transaction(async (tx) => {
    await tx.paymentLedgerAttempt.create({ data: { paymentId: id, attemptNo, status: "PENDING", error: rec.gateway === "razorpay" ? "Awaiting gateway re-attempt (requires live Razorpay keys)" : null } });
    await logPaymentEvent(tx, id, "ATTEMPT", `Retry #${attemptNo} initiated`, { attemptNo }, actor);
  });
  return { id, attemptNo, note: rec.gateway === "razorpay" ? "Retry queued — a live Razorpay charge needs gateway credentials; use Record Payment to settle manually." : "Retry recorded." };
}

export async function reconcilePayment(id: string, actor: Actor) {
  const rec = await db.paymentRecord.findUnique({ where: { id }, select: { id: true, reconciled: true } });
  if (!rec) throw Errors.notFound("Payment not found.");
  await db.paymentRecord.update({ where: { id }, data: { reconciled: !rec.reconciled } });
  await logPaymentEvent(db, id, "RECONCILE", rec.reconciled ? "Marked unreconciled" : "Marked reconciled", undefined, actor);
  return { id, reconciled: !rec.reconciled };
}

export async function addNote(id: string, text: string, actor: Actor) {
  const rec = await db.paymentRecord.findUnique({ where: { id }, select: { notes: true } });
  if (!rec) throw Errors.notFound("Payment not found.");
  const stamped = `${new Date().toISOString().slice(0, 10)} — ${text}`;
  await db.paymentRecord.update({ where: { id }, data: { notes: rec.notes ? `${rec.notes}\n${stamped}` : stamped } });
  await logPaymentEvent(db, id, "NOTE", text, undefined, actor);
  return { id };
}

export async function sendReceipt(id: string, actor: Actor) {
  const rec = await db.paymentRecord.findUnique({ where: { id }, select: { id: true, userId: true, code: true, netPaise: true } });
  if (!rec) throw Errors.notFound("Payment not found.");
  await db.notification.create({ data: { userId: rec.userId, channel: "EMAIL", title: "Payment receipt", body: `Receipt for payment ${rec.code} — ₹${Math.round(rec.netPaise / 100)} received. Thank you.`, sentAt: new Date() } });
  await logPaymentEvent(db, id, "RECEIPT", "Payment receipt sent", undefined, actor);
  return { id };
}

// ---------------------------------------------------------------- gateways + webhook log

export async function listGateways(): Promise<GatewayRow[]> {
  const rows = await db.paymentGateway.findMany({ orderBy: { name: "asc" } });
  const liveKeys = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = !!process.env.RAZORPAY_WEBHOOK_SECRET;
  return rows.map((g) => ({ id: g.id, name: g.name, label: g.label, enabled: g.enabled, mode: g.mode, keyId: g.keyId, webhookConfigured: g.webhookConfigured, supportsRefund: g.supportsRefund, liveKeysPresent: g.name === "razorpay" ? liveKeys : true, webhookSecretPresent: g.name === "razorpay" ? webhookSecret : true }));
}

export async function setGateway(name: string, data: { enabled?: boolean; mode?: string; keyId?: string; webhookConfigured?: boolean }, actor: Actor) {
  const g = await db.paymentGateway.update({ where: { name }, data });
  return g;
}

/** Record a received gateway webhook (called from the webhook route). */
export async function recordWebhook(args: { gateway?: string; eventType: string; signatureValid: boolean; paymentRef?: string; paymentId?: string; processed?: boolean; error?: string }) {
  return db.gatewayWebhook.create({ data: { gateway: args.gateway ?? "razorpay", eventType: args.eventType, signatureValid: args.signatureValid, paymentRef: args.paymentRef, paymentId: args.paymentId, processed: args.processed ?? false, error: args.error } });
}

// ---------------------------------------------------------------- reports

export async function paymentReports(args: { dateFrom?: string; dateTo?: string } = {}): Promise<PaymentReports> {
  const where: Prisma.PaymentRecordWhereInput = {};
  if (args.dateFrom || args.dateTo) {
    const r: Prisma.DateTimeFilter = {};
    if (args.dateFrom) r.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) r.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    where.createdAt = r;
  }

  const recs = await db.paymentRecord.findMany({ where, include: { user: { select: { name: true, phone: true } } }, orderBy: { createdAt: "desc" } });

  const daily = new Map<string, { count: number; collectedPaise: number }>();
  const monthly = new Map<string, { count: number; collectedPaise: number }>();
  const byMethod = new Map<string, { count: number; collectedPaise: number }>();
  const byGateway = new Map<string, { count: number; collectedPaise: number }>();
  const byStatus = new Map<string, number>();
  let autopayCount = 0, autopayPaise = 0, grossPaise = 0, netPaise = 0, gstPaise = 0, discountPaise = 0;
  const rows: PaymentReports["rows"] = [];

  for (const p of recs) {
    const collected = p.status === "SUCCESS" ? p.netPaise : 0;
    const day = p.createdAt.toISOString().slice(0, 10);
    const mon = p.createdAt.toISOString().slice(0, 7);
    const bump = (m: Map<string, { count: number; collectedPaise: number }>, k: string) => { const e = m.get(k) ?? { count: 0, collectedPaise: 0 }; e.count++; e.collectedPaise += collected; m.set(k, e); };
    bump(daily, day); bump(monthly, mon); bump(byMethod, p.method); bump(byGateway, p.gateway);
    byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    if (p.source === "AUTOPAY") { autopayCount++; autopayPaise += collected; }
    if (p.status === "SUCCESS") { grossPaise += p.amountPaise; netPaise += p.netPaise; gstPaise += p.gstPaise; discountPaise += p.discountPaise; }
    rows.push({ code: p.code, date: day, customer: p.user.name ?? p.user.phone ?? "—", method: p.method, gateway: p.gateway, source: p.source, status: p.status, amountRupees: Math.round(p.amountPaise / 100), walletRupees: Math.round(p.walletUsedPaise / 100), gstRupees: Math.round(p.gstPaise / 100), netRupees: Math.round(p.netPaise / 100), invoice: p.invoiceNumber ?? "" });
  }

  const [refundAgg, refundWallet, walletUsed, cashback, referral] = await Promise.all([
    db.paymentRefund.aggregate({ _count: true, _sum: { amountPaise: true } }),
    db.paymentRefund.aggregate({ where: { toWallet: true }, _sum: { amountPaise: true } }),
    db.paymentRecord.aggregate({ where, _sum: { walletUsedPaise: true } }),
    db.walletTxn.aggregate({ where: { kind: "cashback", type: "CREDIT" }, _sum: { amountPaise: true } }),
    db.walletTxn.aggregate({ where: { kind: "referral", type: "CREDIT" }, _sum: { amountPaise: true } }),
  ]);

  const arr = (m: Map<string, { count: number; collectedPaise: number }>) => [...m].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    daily: arr(daily).map(([date, v]) => ({ date, ...v })),
    monthly: arr(monthly).map(([month, v]) => ({ month, ...v })),
    byMethod: [...byMethod].map(([method, v]) => ({ method, ...v })),
    byGateway: [...byGateway].map(([gateway, v]) => ({ gateway, ...v })),
    byStatus: [...byStatus].map(([status, count]) => ({ status, count })),
    refunds: { count: refundAgg._count, amountPaise: refundAgg._sum.amountPaise ?? 0, toWalletPaise: refundWallet._sum.amountPaise ?? 0 },
    wallet: { usedPaise: walletUsed._sum.walletUsedPaise ?? 0, cashbackPaise: cashback._sum.amountPaise ?? 0, referralPaise: referral._sum.amountPaise ?? 0 },
    autopay: { count: autopayCount, collectedPaise: autopayPaise },
    revenue: { grossPaise, netPaise, gstPaise, discountPaise },
    rows,
  };
}

// ---------------------------------------------------------------- bulk

export async function bulkPayments(args: { ids: string[]; action: string }, actor: Actor) {
  const ids = [...new Set(args.ids)].slice(0, 500);
  const valid = await db.paymentRecord.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const validIds = valid.map((v) => v.id);
  if (!validIds.length) throw Errors.badRequest("No valid payments selected.");

  if (args.action === "reconcile") {
    await db.paymentRecord.updateMany({ where: { id: { in: validIds } }, data: { reconciled: true } });
    await db.paymentEvent.createMany({ data: validIds.map((paymentId) => ({ paymentId, type: "RECONCILE", summary: "Reconciled (bulk)", byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action };
  }
  if (args.action === "receipts") {
    const recs = await db.paymentRecord.findMany({ where: { id: { in: validIds } }, select: { id: true, userId: true, code: true, netPaise: true } });
    await db.notification.createMany({ data: recs.map((r) => ({ userId: r.userId, channel: "EMAIL" as const, title: "Payment receipt", body: `Receipt for ${r.code} — ₹${Math.round(r.netPaise / 100)} received.`, sentAt: new Date() })) });
    await db.paymentEvent.createMany({ data: validIds.map((paymentId) => ({ paymentId, type: "RECEIPT", summary: "Receipt sent (bulk)", byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action };
  }
  if (args.action === "export") {
    await db.paymentEvent.createMany({ data: validIds.map((paymentId) => ({ paymentId, type: "NOTE", summary: "Exported (bulk)", byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip })) });
    return { count: validIds.length, action: args.action };
  }
  throw Errors.badRequest("Unknown bulk action.");
}

// ---------------------------------------------------------------- options (record form)

export async function recordOptions(q?: string, userId?: string) {
  if (userId) {
    const [orders, billings, subs] = await Promise.all([
      db.order.findMany({ where: { userId, status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, type: true, totalPaise: true, status: true } }),
      db.subscriptionBilling.findMany({ where: { userId, paymentStatus: { in: ["PENDING", "FAILED", "PARTIAL"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, code: true, cycleNumber: true, totalPaise: true } }),
      db.subscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, plan: { select: { name: true } }, status: true } }),
    ]);
    return { orders, billings, subscriptions: subs.map((s) => ({ id: s.id, plan: s.plan.name, status: s.status })) };
  }
  if (q?.trim()) {
    const customers = await db.user.findMany({ where: { role: "CUSTOMER", OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }, take: 10, select: { id: true, name: true, email: true, phone: true } });
    return { customers };
  }
  return { customers: [] };
}
