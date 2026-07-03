/* =============================================================
   DOODLY — Subscription Billing service layer
   The single source of truth behind /api/admin/billing/*.
   One billing record per billing cycle; money is integer paise.
   Money breakdown:  total = billingAmount − discount + GST − walletUsed
   Wallet movements reuse the WalletTxn ledger (balanceAfter, unique
   reference); auto-pay collection is modelled against the customer's
   saved RecurringPaymentMethod mandate (real card/UPI charges need
   live Razorpay keys). Every mutation appends a BillingEvent.
   ============================================================= */
import "server-only";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { Errors } from "@/lib/http";
import { generateReference } from "@/lib/wallet/engine";
import { adminCredit } from "@/lib/wallet/service";
import type {
  BillingListResponse, BillingListItem, BillingStats, BillingDetail, BillingPreview,
  BillingReports, BillingConfigShape,
} from "./types";

export interface Actor { actorId?: string; actorRole?: string; ip?: string }

type Tx = Prisma.TransactionClient;
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;
const RENEWAL_WINDOW_DAYS = 7;

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pad = (n: number, w = 6) => String(n).padStart(w, "0");

async function nextSeq(tx: Tx, key: string): Promise<number> {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

// ---------------------------------------------------------------- config

const DEFAULT_CONFIG = { gstBps: 0, autopayRetryLimit: 3, autopayRetryIntervalHours: 24, invoicePrefix: "DOODLY/SB", companyName: "DOODLY", gstin: null as string | null };

export async function getBillingConfig(canEdit = false): Promise<BillingConfigShape> {
  const cfg = await db.billingConfig.findUnique({ where: { id: "default" } });
  const c = cfg ?? DEFAULT_CONFIG;
  return { gstBps: c.gstBps, autopayRetryLimit: c.autopayRetryLimit, autopayRetryIntervalHours: c.autopayRetryIntervalHours, invoicePrefix: c.invoicePrefix, companyName: c.companyName, gstin: c.gstin, canEdit };
}

export async function setBillingConfig(args: Partial<Omit<BillingConfigShape, "canEdit">>, actor: Actor) {
  const data: Prisma.BillingConfigUncheckedUpdateInput = {};
  if (args.gstBps !== undefined) data.gstBps = args.gstBps;
  if (args.autopayRetryLimit !== undefined) data.autopayRetryLimit = args.autopayRetryLimit;
  if (args.autopayRetryIntervalHours !== undefined) data.autopayRetryIntervalHours = args.autopayRetryIntervalHours;
  if (args.invoicePrefix !== undefined) data.invoicePrefix = args.invoicePrefix;
  if (args.companyName !== undefined) data.companyName = args.companyName;
  if (args.gstin !== undefined) data.gstin = args.gstin;
  await db.billingConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...DEFAULT_CONFIG, ...args, gstin: args.gstin ?? null },
    update: data,
  });
  return getBillingConfig(true);
}

async function rawConfig() {
  return (await db.billingConfig.findUnique({ where: { id: "default" } })) ?? { ...DEFAULT_CONFIG, id: "default", updatedAt: new Date() };
}

// ---------------------------------------------------------------- money

function compute(perDeliveryPaise: number, planDays: number, planDiscountBps: number, gstBps: number, walletRequestedPaise: number, walletAvailablePaise: number) {
  const billingAmountPaise = perDeliveryPaise * planDays;
  const discountPaise = Math.round((billingAmountPaise * planDiscountBps) / 10000);
  const taxable = billingAmountPaise - discountPaise;
  const gstPaise = Math.round((taxable * gstBps) / 10000);
  const grossPayable = taxable + gstPaise;
  const walletUsedPaise = Math.max(0, Math.min(walletRequestedPaise || 0, walletAvailablePaise, grossPayable));
  const totalPaise = grossPayable - walletUsedPaise;
  return { billingAmountPaise, discountPaise, gstPaise, walletUsedPaise, totalPaise };
}

/** Post a wallet DEBIT atomically inside an existing tx; returns new balance. */
async function debitWallet(tx: Tx, p: { userId: string; amountPaise: number; subscriptionId: string; description: string }) {
  const user = await tx.user.update({ where: { id: p.userId }, data: { walletPaise: { decrement: p.amountPaise } }, select: { walletPaise: true } });
  for (let i = 0; i < 5; i++) {
    try {
      await tx.walletTxn.create({
        data: {
          userId: p.userId, type: "DEBIT", kind: "usage", amountPaise: p.amountPaise, balanceAfterPaise: user.walletPaise,
          reference: generateReference(), description: p.description, reason: "subscription_billing", subscriptionId: p.subscriptionId,
        },
      });
      return user.walletPaise;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target).includes("reference")) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a unique wallet reference.");
}

async function logEvent(client: Tx | typeof db, billingId: string, type: string, summary: string, detail: unknown, actor: Actor) {
  await client.billingEvent.create({
    data: { billingId, type, summary, detail: detail === undefined ? Prisma.JsonNull : (detail as Prisma.InputJsonValue), byId: actor.actorId, byRole: actor.actorRole, ip: actor.ip },
  });
}

async function notify(client: Tx | typeof db, userId: string, title: string, body: string) {
  await client.notification.create({ data: { userId, channel: "PUSH", title, body, sentAt: new Date() } });
}

// ---------------------------------------------------------------- stats

export async function billingStats(): Promise<BillingStats> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = addDays(todayStart, 1);
  const renewalEnd = addDays(now, RENEWAL_WINDOW_DAYS);

  const [activeCycles, upcoming, today, failed, success, autopay, pendingAgg, collectedAgg, invoices, activeForMrr] = await Promise.all([
    db.subscriptionBilling.count({ where: { billingStatus: "ISSUED", subscription: { status: "ACTIVE" } } }),
    db.subscriptionBilling.count({ where: { billingStatus: { in: ["ISSUED", "RENEWED"] }, renewalDate: { gte: now, lte: renewalEnd } } }),
    db.subscriptionBilling.count({ where: { renewalDate: { gte: todayStart, lt: todayEnd } } }),
    db.subscriptionBilling.count({ where: { paymentStatus: "FAILED" } }),
    db.subscriptionBilling.count({ where: { paymentStatus: "PAID" } }),
    db.subscriptionBilling.count({ where: { autoPay: true, billingStatus: { not: "CANCELLED" } } }),
    db.subscriptionBilling.aggregate({ where: { paymentStatus: { in: ["PENDING", "PARTIAL", "FAILED"] } }, _sum: { totalPaise: true, amountPaidPaise: true } }),
    db.subscriptionBilling.aggregate({ where: { paymentStatus: { in: ["PAID", "PARTIAL"] } }, _sum: { amountPaidPaise: true } }),
    db.subscriptionBilling.count({ where: { invoiceNumber: { not: null } } }),
    db.subscription.findMany({ where: { status: "ACTIVE" }, select: { items: { select: { qty: true, variant: { select: { dailyPaise: true } } } } } }),
  ]);

  const pendingCollectionsPaise = (pendingAgg._sum.totalPaise ?? 0) - (pendingAgg._sum.amountPaidPaise ?? 0);
  const mrrPaise = activeForMrr.reduce((s, sub) => s + sub.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0) * 30, 0);

  return {
    activeBillingCycles: activeCycles,
    upcomingRenewals: upcoming,
    todaysRenewals: today,
    failedPayments: failed,
    successfulPayments: success,
    autoPayRenewals: autopay,
    pendingCollectionsPaise: Math.max(0, pendingCollectionsPaise),
    totalBillingRevenuePaise: collectedAgg._sum.amountPaidPaise ?? 0,
    mrrPaise,
    invoicesIssued: invoices,
  };
}

// ---------------------------------------------------------------- list

export interface ListArgs {
  paymentStatus?: string; billingStatus?: string; autopay?: string; planSlug?: string; productId?: string;
  dateFrom?: string; dateTo?: string; q?: string; sort?: string; page?: number; pageSize?: number;
}

const SORTS: Record<string, Prisma.SubscriptionBillingOrderByWithRelationInput> = {
  latest: { billingDate: "desc" }, oldest: { billingDate: "asc" }, amount_high: { totalPaise: "desc" },
  amount_low: { totalPaise: "asc" }, renewal: { renewalDate: "asc" },
};

export async function listBillings(args: ListArgs): Promise<BillingListResponse> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, args.pageSize ?? 20));
  const and: Prisma.SubscriptionBillingWhereInput[] = [];

  if (args.paymentStatus) and.push({ paymentStatus: args.paymentStatus as never });
  if (args.billingStatus) and.push({ billingStatus: args.billingStatus as never });
  if (args.autopay === "on") and.push({ autoPay: true });
  if (args.autopay === "off") and.push({ autoPay: false });
  if (args.planSlug) and.push({ planSlug: args.planSlug });
  if (args.productId) and.push({ subscription: { items: { some: { variant: { productId: args.productId } } } } });
  if (args.dateFrom || args.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (args.dateFrom) range.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) range.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    and.push({ billingDate: range });
  }
  if (args.q?.trim()) {
    const q = args.q.trim();
    and.push({ OR: [
      { code: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { subscriptionId: { contains: q.toLowerCase() } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
      { user: { id: { contains: q.toLowerCase() } } },
    ] });
  }
  const where: Prisma.SubscriptionBillingWhereInput = and.length ? { AND: and } : {};
  const orderBy = SORTS[args.sort ?? "latest"] ?? SORTS.latest;

  const [rows, total, plans, products] = await Promise.all([
    db.subscriptionBilling.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      include: { user: { select: { id: true, name: true, phone: true } }, items: { take: 1 } },
    }),
    db.subscriptionBilling.count({ where }),
    db.plan.findMany({ where: { active: true }, orderBy: { days: "asc" }, select: { slug: true, name: true } }),
    db.product.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const billings: BillingListItem[] = rows.map((b) => ({
    id: b.id, code: b.code, subscriptionId: b.subscriptionId, subscriptionShortId: b.subscriptionId.slice(-8).toUpperCase(),
    customer: { id: b.user.id, name: b.user.name, phone: b.user.phone },
    product: b.items[0]?.productName ?? "—", variant: b.items[0]?.variantLabel ?? "",
    planName: b.planName, cycleLabel: b.cycleLabel, cycleNumber: b.cycleNumber,
    billingDate: b.billingDate.toISOString(), renewalDate: b.renewalDate.toISOString(),
    billingAmountPaise: b.billingAmountPaise, walletUsedPaise: b.walletUsedPaise, discountPaise: b.discountPaise,
    gstPaise: b.gstPaise, totalPaise: b.totalPaise, amountPaidPaise: b.amountPaidPaise,
    autoPay: b.autoPay, paymentStatus: b.paymentStatus, billingStatus: b.billingStatus,
    invoiceNumber: b.invoiceNumber, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
  }));
  return { billings, total, page, pageSize, facets: { plans, products } };
}

// ---------------------------------------------------------------- detail

export async function getBillingDetail(id: string): Promise<BillingDetail | null> {
  const b = await db.subscriptionBilling.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, walletPaise: true } },
      items: true,
      attempts: { orderBy: { attemptNo: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      subscription: { select: { id: true, autopay: { select: { status: true, nextRenewalAt: true, attempts: true } } } },
    },
  });
  if (!b) return null;

  const [trial, walletTxns, renewals, cfg] = await Promise.all([
    db.trialCashback.findUnique({ where: { userId: b.userId }, select: { status: true, amountPaise: true } }),
    db.walletTxn.findMany({ where: { userId: b.userId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, kind: true, amountPaise: true, description: true, createdAt: true } }),
    db.subscriptionBilling.findMany({ where: { subscriptionId: b.subscriptionId }, orderBy: { cycleNumber: "asc" }, select: { code: true, cycleNumber: true, billingDate: true, totalPaise: true, paymentStatus: true } }),
    rawConfig(),
  ]);

  return {
    id: b.id, code: b.code, subscriptionId: b.subscriptionId, subscriptionShortId: b.subscriptionId.slice(-8).toUpperCase(),
    cycleNumber: b.cycleNumber, cycleLabel: b.cycleLabel,
    billingDate: b.billingDate.toISOString(), periodStart: b.periodStart.toISOString(), periodEnd: b.periodEnd.toISOString(), renewalDate: b.renewalDate.toISOString(),
    planName: b.planName, planSlug: b.planSlug,
    customer: { id: b.user.id, name: b.user.name, email: b.user.email, phone: b.user.phone, walletPaise: b.user.walletPaise },
    items: b.items.map((i) => ({ productName: i.productName, variantLabel: i.variantLabel, qty: i.qty, unitPaise: i.unitPaise, lineTotalPaise: i.lineTotalPaise })),
    billingAmountPaise: b.billingAmountPaise, discountPaise: b.discountPaise, gstBps: b.gstBps, gstPaise: b.gstPaise,
    walletUsedPaise: b.walletUsedPaise, totalPaise: b.totalPaise, amountPaidPaise: b.amountPaidPaise, duePaise: Math.max(0, b.totalPaise - b.amountPaidPaise),
    autoPay: b.autoPay, paymentStatus: b.paymentStatus, billingStatus: b.billingStatus, attemptsCount: b.attemptsCount,
    invoiceNumber: b.invoiceNumber, invoiceIssuedAt: b.invoiceIssuedAt?.toISOString() ?? null, notes: b.notes,
    createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
    autopay: b.subscription.autopay ? { status: b.subscription.autopay.status, nextRenewalAt: b.subscription.autopay.nextRenewalAt?.toISOString() ?? null, attempts: b.subscription.autopay.attempts } : null,
    trialCashback: trial ? { status: trial.status, amountPaise: trial.amountPaise } : null,
    walletTxns: walletTxns.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
    attempts: b.attempts.map((a) => ({ id: a.id, attemptNo: a.attemptNo, method: a.method, status: a.status, amountPaise: a.amountPaise, walletPaise: a.walletPaise, reference: a.reference, gatewayRef: a.gatewayRef, failureReason: a.failureReason, createdAt: a.createdAt.toISOString() })),
    renewals: renewals.map((r) => ({ code: r.code, cycleNumber: r.cycleNumber, billingDate: r.billingDate.toISOString(), totalPaise: r.totalPaise, paymentStatus: r.paymentStatus })),
    events: b.events.map((e) => ({ id: e.id, type: e.type, summary: e.summary, detail: e.detail, byRole: e.byRole, createdAt: e.createdAt.toISOString() })),
    company: { name: cfg.companyName, gstin: cfg.gstin },
  };
}

// ---------------------------------------------------------------- preview (create form)

async function loadSubForBilling(subscriptionId: string) {
  return db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      user: { select: { id: true, name: true, phone: true, walletPaise: true } },
      plan: { select: { name: true, slug: true, days: true, discountBps: true } },
      items: { include: { variant: { select: { label: true, dailyPaise: true, product: { select: { name: true } } } } } },
    },
  });
}

function cycleWindow(sub: { startDate: Date; plan: { days: number } }, lastPeriodEnd: Date | null) {
  const periodStart = lastPeriodEnd ? startOfDay(lastPeriodEnd) : startOfDay(sub.startDate);
  const periodEnd = addDays(periodStart, sub.plan.days);
  return { periodStart, periodEnd };
}

export async function previewBilling(subscriptionId: string, walletRequestedPaise = 0): Promise<BillingPreview> {
  const sub = await loadSubForBilling(subscriptionId);
  if (!sub) throw Errors.notFound("Subscription not found.");
  const cfg = await rawConfig();
  const last = await db.subscriptionBilling.findFirst({ where: { subscriptionId }, orderBy: { cycleNumber: "desc" }, select: { cycleNumber: true, periodEnd: true } });
  const cycleNumber = (last?.cycleNumber ?? 0) + 1;
  const { periodStart, periodEnd } = cycleWindow(sub, last?.periodEnd ?? null);
  const perDelivery = sub.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
  const m = compute(perDelivery, sub.plan.days, sub.plan.discountBps, cfg.gstBps, walletRequestedPaise, sub.user.walletPaise);

  return {
    subscriptionId, subscriptionShortId: subscriptionId.slice(-8).toUpperCase(),
    customer: { id: sub.user.id, name: sub.user.name, phone: sub.user.phone, walletPaise: sub.user.walletPaise },
    planName: sub.plan.name, cycleNumber, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), renewalDate: periodEnd.toISOString(),
    items: sub.items.map((i) => ({ productName: i.variant.product.name, variantLabel: i.variant.label, qty: i.qty, unitPaise: i.variant.dailyPaise ?? 0, lineTotalPaise: i.qty * (i.variant.dailyPaise ?? 0) * sub.plan.days })),
    billingAmountPaise: m.billingAmountPaise, discountPaise: m.discountPaise, gstBps: cfg.gstBps, gstPaise: m.gstPaise,
    maxWalletPaise: sub.user.walletPaise, alreadyBilled: false,
  };
}

// ---------------------------------------------------------------- create

export interface CreateArgs { subscriptionId: string; walletApplyPaise?: number; gstBps?: number; autoCollect?: boolean }

async function createCycleBilling(subscriptionId: string, opts: { walletApplyPaise?: number; gstBps?: number }, actor: Actor) {
  const sub = await loadSubForBilling(subscriptionId);
  if (!sub) throw Errors.notFound("Subscription not found.");
  if (sub.status === "CANCELLED") throw Errors.conflict("Cannot bill a cancelled subscription.");
  const cfg = await rawConfig();
  const last = await db.subscriptionBilling.findFirst({ where: { subscriptionId }, orderBy: { cycleNumber: "desc" }, select: { cycleNumber: true, periodEnd: true } });
  const cycleNumber = (last?.cycleNumber ?? 0) + 1;
  const { periodStart, periodEnd } = cycleWindow(sub, last?.periodEnd ?? null);
  const gstBps = opts.gstBps ?? cfg.gstBps;
  const perDelivery = sub.items.reduce((a, i) => a + i.qty * (i.variant.dailyPaise ?? 0), 0);
  const m = compute(perDelivery, sub.plan.days, sub.plan.discountBps, gstBps, opts.walletApplyPaise ?? 0, sub.user.walletPaise);
  const year = periodStart.getFullYear();

  return db.$transaction(async (tx) => {
    const code = `BILL-${pad(await nextSeq(tx, "billing"))}`;
    if (m.walletUsedPaise > 0) {
      await debitWallet(tx, { userId: sub.userId, amountPaise: m.walletUsedPaise, subscriptionId, description: `Wallet applied to ${code}` });
    }
    const invoiceSeq = await nextSeq(tx, `sbinvoice:${year}`);
    const invoiceNumber = `${cfg.invoicePrefix}/${year}/${pad(invoiceSeq, 5)}`;
    const fullyWalletPaid = m.totalPaise === 0;

    let billing;
    try {
      billing = await tx.subscriptionBilling.create({
        data: {
          code, subscriptionId, userId: sub.userId, cycleNumber, billingDate: new Date(), periodStart, periodEnd, renewalDate: periodEnd,
          planName: sub.plan.name, planSlug: sub.plan.slug, cycleLabel: `${sub.plan.days}-day cycle`,
          billingAmountPaise: m.billingAmountPaise, discountPaise: m.discountPaise, gstBps, gstPaise: m.gstPaise,
          walletUsedPaise: m.walletUsedPaise, totalPaise: m.totalPaise, amountPaidPaise: fullyWalletPaid ? 0 : 0,
          autoPay: sub.autoRenew, paymentStatus: fullyWalletPaid ? "PAID" : "PENDING", billingStatus: "ISSUED",
          invoiceNumber, invoiceIssuedAt: new Date(), createdById: actor.actorId,
          items: { create: sub.items.map((i) => ({ productName: i.variant.product.name, variantLabel: i.variant.label, qty: i.qty, unitPaise: i.variant.dailyPaise ?? 0, lineTotalPaise: i.qty * (i.variant.dailyPaise ?? 0) * sub.plan.days })) },
        },
        select: { id: true, code: true, totalPaise: true, paymentStatus: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict(`A billing record already exists for cycle ${cycleNumber} of this subscription.`);
      throw e;
    }

    await logEvent(tx, billing.id, "CREATED", `Billing ${code} created for cycle ${cycleNumber} (${sub.plan.name})`, { billingAmountPaise: m.billingAmountPaise, discountPaise: m.discountPaise, gstPaise: m.gstPaise, walletUsedPaise: m.walletUsedPaise, totalPaise: m.totalPaise }, actor);
    if (m.walletUsedPaise > 0) await logEvent(tx, billing.id, "WALLET", `Wallet deduction ₹${Math.round(m.walletUsedPaise / 100)}`, { walletUsedPaise: m.walletUsedPaise }, actor);
    await logEvent(tx, billing.id, "INVOICE", `Invoice ${invoiceNumber} generated`, { invoiceNumber }, actor);
    if (fullyWalletPaid) await logEvent(tx, billing.id, "PAYMENT", "Settled in full from wallet", { method: "WALLET" }, actor);

    return billing;
  }, TX);
}

export async function createBilling(args: CreateArgs, actor: Actor) {
  const billing = await createCycleBilling(args.subscriptionId, { walletApplyPaise: args.walletApplyPaise, gstBps: args.gstBps }, actor);
  if (args.autoCollect && billing.paymentStatus !== "PAID") {
    await processAutopay(billing.id, actor, false);
  }
  return { id: billing.id, code: billing.code };
}

// ---------------------------------------------------------------- payments

function methodFromMandate(type: string): PaymentMethod {
  const t = type.toLowerCase();
  if (t.includes("card")) return "CARD";
  if (t.includes("net")) return "NETBANKING";
  return "UPI";
}

/** Auto-pay / retry collection. Charges the customer's saved mandate; with no
    mandate it fails and (past the retry limit) suspends auto-pay. */
export async function processAutopay(billingId: string, actor: Actor, isRetry: boolean) {
  const cfg = await rawConfig();
  return db.$transaction(async (tx) => {
    const b = await tx.subscriptionBilling.findUnique({ where: { id: billingId }, select: { id: true, code: true, userId: true, subscriptionId: true, totalPaise: true, amountPaidPaise: true, paymentStatus: true, attemptsCount: true, billingStatus: true } });
    if (!b) throw Errors.notFound("Billing record not found.");
    if (b.billingStatus === "CANCELLED") throw Errors.conflict("Billing record is cancelled.");
    if (b.paymentStatus === "PAID") throw Errors.conflict("Billing is already fully paid.");
    const due = Math.max(0, b.totalPaise - b.amountPaidPaise);
    const attemptNo = b.attemptsCount + 1;

    const mandate = await tx.recurringPaymentMethod.findFirst({ where: { userId: b.userId }, orderBy: { isDefault: "desc" } });

    if (mandate) {
      await tx.billingPaymentAttempt.create({ data: { billingId, attemptNo, method: methodFromMandate(mandate.type), status: "SUCCESS", amountPaise: due, reference: `BPA-${b.code.replace("BILL-", "")}-${attemptNo}`, gatewayRef: mandate.token ?? `mandate_${mandate.id.slice(-8)}`, byId: actor.actorId, byRole: actor.actorRole } });
      await tx.subscriptionBilling.update({ where: { id: billingId }, data: { amountPaidPaise: b.totalPaise, paymentStatus: "PAID", attemptsCount: attemptNo } });
      await tx.autopaySubscription.updateMany({ where: { subscriptionId: b.subscriptionId }, data: { status: "ACTIVE", attempts: 0, nextRenewalAt: addDays(new Date(), 30) } });
      await logEvent(tx, billingId, "PAYMENT", `${isRetry ? "Retry" : "Auto-pay"} charge of ₹${Math.round(due / 100)} succeeded`, { method: methodFromMandate(mandate.type), attemptNo }, actor);
      return { status: "PAID" as const, attemptNo };
    }

    const limitHit = attemptNo >= cfg.autopayRetryLimit;
    await tx.billingPaymentAttempt.create({ data: { billingId, attemptNo, method: "UPI", status: "FAILED", amountPaise: due, reference: `BPA-${b.code.replace("BILL-", "")}-${attemptNo}`, failureReason: "No active auto-pay mandate on file", byId: actor.actorId, byRole: actor.actorRole } });
    await tx.subscriptionBilling.update({ where: { id: billingId }, data: { paymentStatus: "FAILED", attemptsCount: attemptNo } });
    if (limitHit) await tx.autopaySubscription.updateMany({ where: { subscriptionId: b.subscriptionId }, data: { status: "SUSPENDED", attempts: attemptNo } });
    await logEvent(tx, billingId, "FAILED", `${isRetry ? "Retry" : "Auto-pay"} charge failed (attempt ${attemptNo}/${cfg.autopayRetryLimit})${limitHit ? " — auto-pay suspended" : ""}`, { attemptNo, limitHit }, actor);
    await notify(tx, b.userId, "Payment could not be processed", `We couldn't collect ₹${Math.round(due / 100)} for ${b.code}. Please update your payment method.`);
    return { status: limitHit ? "SUSPENDED" as const : "FAILED" as const, attemptNo };
  }, TX);
}

export async function recordManualPayment(billingId: string, p: { method: PaymentMethod; amountPaise: number }, actor: Actor) {
  return db.$transaction(async (tx) => {
    const b = await tx.subscriptionBilling.findUnique({ where: { id: billingId }, select: { id: true, code: true, totalPaise: true, amountPaidPaise: true, attemptsCount: true, billingStatus: true, paymentStatus: true } });
    if (!b) throw Errors.notFound("Billing record not found.");
    if (b.billingStatus === "CANCELLED") throw Errors.conflict("Billing record is cancelled.");
    if (b.paymentStatus === "PAID") throw Errors.conflict("Billing is already fully paid.");
    const amount = Math.max(1, Math.min(p.amountPaise, b.totalPaise - b.amountPaidPaise));
    const attemptNo = b.attemptsCount + 1;
    const newPaid = b.amountPaidPaise + amount;
    const status = newPaid >= b.totalPaise ? "PAID" : "PARTIAL";
    await tx.billingPaymentAttempt.create({ data: { billingId, attemptNo, method: p.method, status: "SUCCESS", amountPaise: amount, reference: `BPA-${b.code.replace("BILL-", "")}-${attemptNo}`, gatewayRef: `manual_${b.code}`, byId: actor.actorId, byRole: actor.actorRole } });
    await tx.subscriptionBilling.update({ where: { id: billingId }, data: { amountPaidPaise: newPaid, paymentStatus: status, attemptsCount: attemptNo } });
    await logEvent(tx, billingId, "PAYMENT", `Manual ${p.method} collection of ₹${Math.round(amount / 100)} recorded (${status})`, { method: p.method, amount }, actor);
    return { status, paidPaise: newPaid };
  }, TX);
}

export async function changePaymentMethod(billingId: string, p: { type: string; label?: string }, actor: Actor) {
  const b = await db.subscriptionBilling.findUnique({ where: { id: billingId }, select: { userId: true, code: true } });
  if (!b) throw Errors.notFound("Billing record not found.");
  await db.$transaction(async (tx) => {
    await tx.recurringPaymentMethod.updateMany({ where: { userId: b.userId }, data: { isDefault: false } });
    await tx.recurringPaymentMethod.create({ data: { userId: b.userId, type: p.type, label: p.label ?? p.type, isDefault: true, token: `mandate_${Date.now().toString(36)}` } });
    await logEvent(tx, billingId, "METHOD", `Payment method changed to ${p.type}`, { type: p.type }, actor);
  });
  return { id: billingId };
}

// ---------------------------------------------------------------- renew / invoice / cancel / note

export async function renewBilling(billingId: string, actor: Actor) {
  const b = await db.subscriptionBilling.findUnique({ where: { id: billingId }, select: { id: true, subscriptionId: true, billingStatus: true, periodEnd: true } });
  if (!b) throw Errors.notFound("Billing record not found.");
  if (b.billingStatus === "CANCELLED") throw Errors.conflict("Cannot renew a cancelled billing record.");

  const sub = await db.subscription.findUnique({ where: { id: b.subscriptionId }, select: { autoRenew: true, plan: { select: { days: true } } } });
  const next = await createCycleBilling(b.subscriptionId, {}, actor);
  await db.$transaction(async (tx) => {
    await tx.subscriptionBilling.update({ where: { id: billingId }, data: { billingStatus: "RENEWED" } });
    await tx.subscription.update({ where: { id: b.subscriptionId }, data: { endDate: addDays(startOfDay(b.periodEnd), sub?.plan.days ?? 30), nextDeliveryAt: addDays(startOfDay(b.periodEnd), 1) } });
    await logEvent(tx, billingId, "RENEWED", `Renewed → new cycle billing ${next.code}`, { nextBillingId: next.id, nextCode: next.code }, actor);
    await logEvent(tx, next.id, "RENEWED", `Created via renewal of a previous cycle`, null, actor);
  });
  if (sub?.autoRenew && next.paymentStatus !== "PAID") await processAutopay(next.id, actor, false);
  return { id: next.id, code: next.code };
}

export async function generateInvoice(billingId: string, actor: Actor) {
  const b = await db.subscriptionBilling.findUnique({ where: { id: billingId }, select: { invoiceNumber: true, periodStart: true } });
  if (!b) throw Errors.notFound("Billing record not found.");
  if (b.invoiceNumber) return { invoiceNumber: b.invoiceNumber, reused: true };
  const cfg = await rawConfig();
  const year = b.periodStart.getFullYear();
  const out = await db.$transaction(async (tx) => {
    const seq = await nextSeq(tx, `sbinvoice:${year}`);
    const invoiceNumber = `${cfg.invoicePrefix}/${year}/${pad(seq, 5)}`;
    await tx.subscriptionBilling.update({ where: { id: billingId }, data: { invoiceNumber, invoiceIssuedAt: new Date() } });
    await logEvent(tx, billingId, "INVOICE", `Invoice ${invoiceNumber} generated`, { invoiceNumber }, actor);
    return invoiceNumber;
  });
  return { invoiceNumber: out, reused: false };
}

export async function cancelBilling(billingId: string, p: { reason?: string; refund?: boolean }, actor: Actor) {
  const b = await db.subscriptionBilling.findUnique({ where: { id: billingId }, select: { id: true, code: true, userId: true, billingStatus: true, amountPaidPaise: true, walletUsedPaise: true } });
  if (!b) throw Errors.notFound("Billing record not found.");
  if (b.billingStatus === "CANCELLED") throw Errors.conflict("Billing record is already cancelled.");

  await db.subscriptionBilling.update({ where: { id: billingId }, data: { billingStatus: "CANCELLED", notes: p.reason ?? null } });
  await logEvent(db, billingId, "CANCELLED", p.reason ? `Cancelled — ${p.reason}` : "Billing cancelled", { reason: p.reason ?? null }, actor);

  let refund: { amountPaise: number; reference: string } | null = null;
  const refundable = b.amountPaidPaise + b.walletUsedPaise;
  if (p.refund && refundable > 0) {
    const res = await adminCredit({ userId: b.userId, amountPaise: refundable, reason: `Refund for cancelled billing ${b.code}`, actorId: actor.actorId, actorRole: actor.actorRole });
    refund = { amountPaise: refundable, reference: res.txn.reference };
    await db.subscriptionBilling.update({ where: { id: billingId }, data: { paymentStatus: "REFUNDED" } });
    await logEvent(db, billingId, "REFUND", `Refunded ₹${Math.round(refundable / 100)} to wallet`, { amountPaise: refundable, reference: res.txn.reference }, actor);
  }
  return { id: billingId, refund };
}

export async function addNote(billingId: string, text: string, actor: Actor) {
  const b = await db.subscriptionBilling.findUnique({ where: { id: billingId }, select: { notes: true } });
  if (!b) throw Errors.notFound("Billing record not found.");
  const stamped = `${new Date().toISOString().slice(0, 10)} — ${text}`;
  await db.$transaction(async (tx) => {
    await tx.subscriptionBilling.update({ where: { id: billingId }, data: { notes: b.notes ? `${b.notes}\n${stamped}` : stamped } });
    await logEvent(tx, billingId, "NOTE", text, undefined, actor);
  });
  return { id: billingId };
}

// ---------------------------------------------------------------- reports

export async function billingReports(args: { dateFrom?: string; dateTo?: string } = {}): Promise<BillingReports> {
  const where: Prisma.SubscriptionBillingWhereInput = {};
  if (args.dateFrom || args.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (args.dateFrom) range.gte = startOfDay(new Date(args.dateFrom));
    if (args.dateTo) range.lte = addDays(startOfDay(new Date(args.dateTo)), 1);
    where.billingDate = range;
  }

  const rows = await db.subscriptionBilling.findMany({
    where,
    include: { user: { select: { name: true, phone: true } }, attempts: { where: { status: "FAILED" }, orderBy: { attemptNo: "desc" }, take: 1 } },
    orderBy: { billingDate: "desc" },
  });

  const byStatusMap = new Map<string, { count: number; totalPaise: number }>();
  const gstByRate = new Map<number, { gstPaise: number; count: number }>();
  let gross = 0, discount = 0, gst = 0, net = 0, collected = 0, outstanding = 0;
  let autoOn = 0, autoOff = 0, walletUsed = 0;
  const failedRows: BillingReports["failed"]["rows"] = [];

  const csv = rows.map((b) => {
    gross += b.billingAmountPaise; discount += b.discountPaise; gst += b.gstPaise; net += b.totalPaise; collected += b.amountPaidPaise;
    if (b.billingStatus !== "CANCELLED") outstanding += Math.max(0, b.totalPaise - b.amountPaidPaise);
    walletUsed += b.walletUsedPaise;
    b.autoPay ? autoOn++ : autoOff++;
    const st = byStatusMap.get(b.paymentStatus) ?? { count: 0, totalPaise: 0 };
    st.count++; st.totalPaise += b.totalPaise; byStatusMap.set(b.paymentStatus, st);
    const gr = gstByRate.get(b.gstBps) ?? { gstPaise: 0, count: 0 };
    gr.gstPaise += b.gstPaise; gr.count++; gstByRate.set(b.gstBps, gr);
    if (b.paymentStatus === "FAILED") failedRows.push({ code: b.code, customer: b.user.name ?? "—", amountPaise: b.totalPaise, reason: b.attempts[0]?.failureReason ?? "—", date: b.billingDate.toISOString().slice(0, 10) });
    return {
      code: b.code, subscription: b.subscriptionId.slice(-8).toUpperCase(), customer: b.user.name ?? "—", phone: b.user.phone ?? "",
      plan: b.planName, billingDate: b.billingDate.toISOString().slice(0, 10), renewalDate: b.renewalDate.toISOString().slice(0, 10),
      grossRupees: Math.round(b.billingAmountPaise / 100), discountRupees: Math.round(b.discountPaise / 100), gstRupees: Math.round(b.gstPaise / 100),
      walletRupees: Math.round(b.walletUsedPaise / 100), totalRupees: Math.round(b.totalPaise / 100),
      paymentStatus: b.paymentStatus, billingStatus: b.billingStatus, autoPay: b.autoPay ? "Yes" : "No", invoice: b.invoiceNumber ?? "",
    };
  });

  const [cashbackAgg, renewedCount] = await Promise.all([
    db.walletTxn.aggregate({ where: { kind: "cashback", type: "CREDIT" }, _sum: { amountPaise: true } }),
    db.subscriptionBilling.count({ where: { ...where, billingStatus: "RENEWED" } }),
  ]);

  return {
    billing: { totalBillings: rows.length, grossPaise: gross, discountPaise: discount, gstPaise: gst, netPaise: net, collectedPaise: collected, outstandingPaise: outstanding },
    byStatus: [...byStatusMap].map(([status, v]) => ({ status, count: v.count, totalPaise: v.totalPaise })),
    renewals: { total: renewedCount, auto: rows.filter((b) => b.billingStatus === "RENEWED" && b.autoPay).length, manual: rows.filter((b) => b.billingStatus === "RENEWED" && !b.autoPay).length },
    failed: { count: failedRows.length, amountPaise: failedRows.reduce((s, r) => s + r.amountPaise, 0), rows: failedRows.slice(0, 100) },
    autopay: { on: autoOn, off: autoOff },
    wallet: { usedPaise: walletUsed, cashbackPaise: cashbackAgg._sum.amountPaise ?? 0 },
    gst: { collectedPaise: gst, byRate: [...gstByRate].map(([rateBps, v]) => ({ rateBps, gstPaise: v.gstPaise, count: v.count })) },
    rows: csv,
  };
}

// ---------------------------------------------------------------- options (create form)

export async function billingOptions(q?: string) {
  if (!q?.trim()) {
    const subs = await db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED", "VACATION"] } }, orderBy: { createdAt: "desc" }, take: 15,
      select: { id: true, plan: { select: { name: true } }, user: { select: { name: true, phone: true } } },
    });
    return { subscriptions: subs.map((s) => ({ id: s.id, shortId: s.id.slice(-8).toUpperCase(), plan: s.plan.name, customer: s.user.name, phone: s.user.phone })) };
  }
  const term = q.trim();
  const subs = await db.subscription.findMany({
    where: { OR: [{ id: { contains: term.toLowerCase() } }, { user: { name: { contains: term, mode: "insensitive" } } }, { user: { phone: { contains: term } } }] },
    orderBy: { createdAt: "desc" }, take: 15,
    select: { id: true, plan: { select: { name: true } }, user: { select: { name: true, phone: true } } },
  });
  return { subscriptions: subs.map((s) => ({ id: s.id, shortId: s.id.slice(-8).toUpperCase(), plan: s.plan.name, customer: s.user.name, phone: s.user.phone })) };
}
