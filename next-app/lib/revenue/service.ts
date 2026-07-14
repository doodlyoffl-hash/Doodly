/* =============================================================
   DOODLY Growth → Revenue — analytics + revenue-ledger service.
   Read-only. Revenue is RECOGNISED from the authoritative source
   tables (orders + items + payments + wallet + B2B orders + refunds).
   No duplicate revenue tables — the "revenue record" is an Order
   projection; totals are computed on demand. Reuses Payments, Wallet,
   Subscriptions, B2B, Procurement, Expenses.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface RevRange { from?: string | Date; to?: string | Date }
export interface RevFilters extends RevRange {
  source?: string; status?: string; method?: string; q?: string;
  minPaise?: number; maxPaise?: number; sort?: string; page?: number; pageSize?: number;
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLbl = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });

function bucketDaily(rows: { at: Date; v: number }[], from: Date, to: Date) {
  const map: Record<string, number> = {};
  for (let d = startOfDay(from); d <= to; d = new Date(d.getTime() + 864e5)) map[dayKey(d)] = 0;
  for (const r of rows) { const k = dayKey(r.at); if (k in map) map[k] += r.v; }
  return Object.keys(map).sort().map((k) => ({ label: k.slice(5), v: map[k] }));
}
function bucketMonthly(rows: { at: Date; v: number }[], months: number, now = new Date()) {
  const keys: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push({ key: monthKey(d), label: monthLbl(d) }); }
  const map: Record<string, number> = {}; keys.forEach((k) => (map[k.key] = 0));
  for (const r of rows) { const k = monthKey(r.at); if (k in map) map[k] += r.v; }
  return keys.map((k) => ({ label: k.label, v: map[k.key] }));
}

const SOURCE_LABEL: Record<string, string> = { SUBSCRIPTION: "Milk Subscription", ONE_TIME: "One-Time Order", EXTRA: "Add-on Product", SAMPLE: "Trial Pack" };
const METHOD_LABEL: Record<string, string> = { UPI: "UPI", CARD: "Card", NETBANKING: "Net Banking", WALLET: "Wallet", CASH: "Cash" };

// ---------------------------------------------------------------- dashboard
export async function revenueDashboard(rangeIn: RevRange = {}) {
  const now = new Date();
  const to = rangeIn.to ? endOfDay(new Date(rangeIn.to)) : now;
  const from = rangeIn.from ? startOfDay(new Date(rangeIn.from)) : startOfDay(new Date(now.getTime() - 29 * 864e5));
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5));
  const daily = spanDays <= 45;
  const todayStart = startOfDay(now);
  const weekAgo = new Date(now.getTime() - 6 * 864e5);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const PAID = { status: "PAID" as const };
  const [
    revTotal, revToday, revWeek, revMonth, revYear, revRange, byType, grossAgg,
    pending, refundedOrders, walletUsed, refundsAgg, activeSubs, b2bAgg, methodDist, trendRows, segNewRepeat,
  ] = await Promise.all([
    db.order.aggregate({ where: PAID, _sum: { totalPaise: true, couponDiscountPaise: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { ...PAID, createdAt: { gte: todayStart } }, _sum: { totalPaise: true, couponDiscountPaise: true } }),
    db.order.aggregate({ where: { ...PAID, createdAt: { gte: startOfDay(weekAgo) } }, _sum: { totalPaise: true, couponDiscountPaise: true } }),
    db.order.aggregate({ where: { ...PAID, createdAt: { gte: monthStart } }, _sum: { totalPaise: true, couponDiscountPaise: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { ...PAID, createdAt: { gte: yearStart } }, _sum: { totalPaise: true, couponDiscountPaise: true } }),
    db.order.aggregate({ where: { ...PAID, createdAt: { gte: from, lte: to } }, _sum: { totalPaise: true, couponDiscountPaise: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ["type"], where: PAID, _sum: { totalPaise: true, couponDiscountPaise: true }, _count: { _all: true } }),
    db.order.aggregate({ where: PAID, _sum: { subtotalPaise: true, discountPaise: true, taxPaise: true, deliveryPaise: true } }),
    db.order.aggregate({ where: { status: "PENDING" }, _sum: { totalPaise: true, couponDiscountPaise: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { status: "REFUNDED" }, _sum: { totalPaise: true, couponDiscountPaise: true }, _count: { _all: true } }),
    db.walletTxn.aggregate({ where: { type: "DEBIT", kind: "usage" }, _sum: { amountPaise: true } }),
    db.paymentRefund.aggregate({ _sum: { amountPaise: true }, _count: true }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    // Exclude CANCELLED — every other B2B aggregation does, and counting them left a
    // cancelled Rs.1,00,000 order sitting in "B2B billed" and "outstanding" forever.
    db.businessOrder.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { totalPaise: true, paidPaise: true }, _count: true }),
    db.paymentRecord.groupBy({ by: ["method"], _sum: { netPaise: true }, _count: { _all: true } }),
    db.order.findMany({ where: { ...PAID, createdAt: { gte: from, lte: to } }, select: { createdAt: true, totalPaise: true } }),
    db.order.groupBy({ by: ["userId"], where: PAID, _count: { _all: true } }),
  ]);

  const sumType = (t: string) => (byType as never as { type: string; _sum: { totalPaise: number | null } }[]).find((r) => r.type === t)?._sum.totalPaise ?? 0;
  // Revenue = what was actually collected. Order.totalPaise is GROSS: the coupon discount
  // is stored separately and never reached us, so summing totalPaise booked phantom revenue
  // (and it appeared in neither `discountsPaise`, which is the PLAN discount only).
  // Wallet-applied amounts stay in — that cash was collected earlier at recharge.
  const net = (a: { _sum: { totalPaise: number | null; couponDiscountPaise?: number | null } }) =>
    (a._sum.totalPaise ?? 0) - (a._sum.couponDiscountPaise ?? 0);
  const totalRevenue = net(revTotal);
  const paidCount = revTotal._count._all || 0;
  const gross = grossAgg._sum.subtotalPaise ?? 0;
  const discounts = grossAgg._sum.discountPaise ?? 0;
  const gst = grossAgg._sum.taxPaise ?? 0;
  const refundsPaise = refundsAgg._sum.amountPaise ?? 0;
  const b2bCollected = b2bAgg._sum.paidPaise ?? 0;
  const b2bBilled = b2bAgg._sum.totalPaise ?? 0;
  const subsRevenue = sumType("SUBSCRIPTION");
  const monthSubs = await db.order.aggregate({ where: { ...PAID, type: "SUBSCRIPTION", createdAt: { gte: monthStart } }, _sum: { totalPaise: true, couponDiscountPaise: true } });
  const mrr = monthSubs._sum.totalPaise ?? 0; // proxy: this-month subscription revenue

  const repeat = (segNewRepeat as never as { _count: { _all: number } }[]).filter((g) => g._count._all > 1).length;
  const oneTimers = (segNewRepeat as never as { _count: { _all: number } }[]).length - repeat;

  const kpis = {
    todayRevenuePaise: net(revToday),
    weekRevenuePaise: net(revWeek),
    monthRevenuePaise: net(revMonth),
    yearRevenuePaise: net(revYear),
    totalRevenuePaise: totalRevenue,
    rangeRevenuePaise: net(revRange),
    subscriptionRevenuePaise: subsRevenue,
    oneTimeRevenuePaise: sumType("ONE_TIME"),
    trialRevenuePaise: sumType("SAMPLE"),
    addonRevenuePaise: sumType("EXTRA"),
    b2bRevenuePaise: b2bCollected,
    b2bBilledPaise: b2bBilled,
    walletRevenuePaise: walletUsed._sum.amountPaise ?? 0,
    pendingPaymentsPaise: pending._sum.totalPaise ?? 0,
    pendingCount: pending._count._all || 0,
    collectedPaymentsPaise: totalRevenue,
    refundPaise: refundsPaise,
    refundedOrders: refundedOrders._count._all || 0,
    grossRevenuePaise: gross,
    discountsPaise: discounts,
    gstPaise: gst,
    netRevenuePaise: totalRevenue - refundsPaise,
    outstandingRevenuePaise: (pending._sum.totalPaise ?? 0) + Math.max(0, b2bBilled - b2bCollected),
    aovPaise: paidCount ? Math.round(totalRevenue / paidCount) : 0,
    mrrPaise: mrr,
    arrPaise: mrr * 12, // future-ready
    activeSubscriptions: activeSubs,
  };

  const trend = trendRows.map((o) => ({ at: o.createdAt, v: o.totalPaise }));
  const charts = {
    granularity: daily ? "day" : "month",
    revenueTrend: daily ? bucketDaily(trend, from, to) : bucketMonthly(trend, 6, now),
    bySource: (byType as never as { type: string; _sum: { totalPaise: number | null }; _count: { _all: number } }[])
      .map((r) => ({ source: SOURCE_LABEL[r.type] || r.type, revenuePaise: r._sum.totalPaise ?? 0, orders: r._count._all }))
      .concat(b2bCollected ? [{ source: "B2B Orders", revenuePaise: b2bCollected, orders: b2bAgg._count }] : [])
      .sort((a, b) => b.revenuePaise - a.revenuePaise),
    byPaymentMethod: (methodDist as never as { method: string; _sum: { netPaise: number | null }; _count: { _all: number } }[])
      .map((r) => ({ method: METHOD_LABEL[r.method] || r.method, revenuePaise: r._sum.netPaise ?? 0, count: r._count._all }))
      .sort((a, b) => b.revenuePaise - a.revenuePaise),
    bySegment: [
      { segment: "B2C — Consumers", revenuePaise: totalRevenue },
      { segment: "B2B — Businesses", revenuePaise: b2bCollected },
    ].filter((s) => s.revenuePaise > 0),
    customerSplit: { repeat, oneTime: oneTimers },
  };

  return { meta: { from: dayKey(from), to: dayKey(to), spanDays, granularity: charts.granularity, generatedAt: now.toISOString() }, kpis, charts };
}

// ---------------------------------------------------------------- records ledger
function recordWhere(f: RevFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (f.source) where.type = f.source as never;
  if (f.status) where.status = f.status as never;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = startOfDay(new Date(f.from)); if (f.to) r.lte = endOfDay(new Date(f.to)); where.createdAt = r; }
  if (f.minPaise != null || f.maxPaise != null) { where.totalPaise = {}; if (f.minPaise != null) (where.totalPaise as Prisma.IntFilter).gte = f.minPaise; if (f.maxPaise != null) (where.totalPaise as Prisma.IntFilter).lte = f.maxPaise; }
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { id: { contains: q } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
      { invoice: { number: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

const SORTS: Record<string, Prisma.OrderOrderByWithRelationInput> = {
  latest: { createdAt: "desc" }, oldest: { createdAt: "asc" },
  highest: { totalPaise: "desc" }, lowest: { totalPaise: "asc" },
};

export async function listRevenueRecords(f: RevFilters = {}) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const where = recordWhere(f);
  const orderBy = f.sort === "customer" ? { user: { name: "asc" as const } } : SORTS[f.sort ?? "latest"] ?? SORTS.latest;

  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, type: true, status: true, subtotalPaise: true, discountPaise: true, taxPaise: true, deliveryPaise: true, totalPaise: true, createdAt: true,
        user: { select: { id: true, name: true, phone: true } },
        invoice: { select: { number: true } },
        payment: { select: { method: true, status: true } },
        // NOTE: no `take` — the quantity total below sums this array. It used to be take:3
        // (for the "A, B, C +2" label), so a 5-item order reported only the first 3 items'
        // quantities. The label still slices to 3; the sum needs them all.
        items: { select: { productName: true, quantity: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  // wallet used per order (batch)
  const ids = rows.map((r) => r.id);
  const walletByOrder: Record<string, number> = {};
  if (ids.length) {
    const wt = await db.walletTxn.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, type: "DEBIT", kind: "usage" }, _sum: { amountPaise: true } });
    (wt as never as { orderId: string | null; _sum: { amountPaise: number | null } }[]).forEach((w) => { if (w.orderId) walletByOrder[w.orderId] = w._sum.amountPaise ?? 0; });
  }

  const method = (m: string) => (f.method ? m === f.method : true);
  const records = rows
    .filter((r) => method(r.payment?.method ?? ""))
    .map((r) => ({
      id: r.id,
      code: "REV-" + r.id.slice(-8).toUpperCase(),
      orderId: r.id,
      invoiceNo: r.invoice?.number ?? null,
      customerId: r.user?.id ?? null,
      customerName: r.user?.name ?? "—",
      customerPhone: r.user?.phone ?? "",
      source: SOURCE_LABEL[r.type] || r.type,
      sourceType: r.type,
      product: r.items.map((i) => i.productName).join(", ") + (r._count.items > 3 ? ` +${r._count.items - 3}` : ""),
      quantity: r.items.reduce((s, i) => s + i.quantity, 0),
      grossPaise: r.subtotalPaise,
      discountPaise: r.discountPaise,
      gstPaise: r.taxPaise,
      deliveryPaise: r.deliveryPaise,
      walletUsedPaise: walletByOrder[r.id] ?? 0,
      netPaise: r.totalPaise,
      paymentMethod: r.payment?.method ? (METHOD_LABEL[r.payment.method] || r.payment.method) : "—",
      paymentStatus: r.status,
      date: r.createdAt,
    }));

  return { records, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// ---------------------------------------------------------------- record detail
export async function revenueRecordDetail(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true, walletPaise: true } },
      invoice: true, payment: true, items: true, events: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!order) throw new Error("Revenue record not found");
  const [walletTxns, paymentRecord] = await Promise.all([
    db.walletTxn.findMany({ where: { orderId }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, kind: true, amountPaise: true, reference: true, description: true, createdAt: true } }),
    db.paymentRecord.findFirst({ where: { orderId }, include: { refunds: true } }),
  ]);
  return {
    id: order.id, code: "REV-" + order.id.slice(-8).toUpperCase(),
    source: SOURCE_LABEL[order.type] || order.type, status: order.status, createdAt: order.createdAt,
    customer: order.user, invoice: order.invoice,
    breakdown: { grossPaise: order.subtotalPaise, discountPaise: order.discountPaise, gstPaise: order.taxPaise, deliveryPaise: order.deliveryPaise, depositPaise: order.depositPaise, netPaise: order.totalPaise },
    payment: order.payment, paymentRecord: paymentRecord ? { code: paymentRecord.code, method: paymentRecord.method, status: paymentRecord.status, netPaise: paymentRecord.netPaise, walletUsedPaise: paymentRecord.walletUsedPaise, refunds: paymentRecord.refunds } : null,
    items: order.items, walletTxns,
    events: order.events,
  };
}
