/* =============================================================
   DOODLY Growth → Reports — analytics aggregation service.
   Read-only. Generates every KPI, chart series, and report-category
   table LIVE from the authoritative source tables (orders, subscriptions,
   payments, wallet, procurement, quality, deliveries, referrals, products,
   expenses). No duplicate analytics tables — computed on demand.
   Date-range aware; trend windows adapt (daily ≤ 45d span, else monthly).
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { slaPromiseMin, deliveredOnTime } from "@/lib/delivery/late";

export interface ReportRange { from?: string | Date; to?: string | Date }

// ---------- date helpers ----------
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const dayKey = (d: Date) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; };
const monthKey = (d: Date) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"); return `${y}-${m}`; };
const monthLabel = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });

/** Sum `v` per day across [from,to] inclusive → ordered [{label,v}]. */
function bucketDaily(rows: { at: Date; v: number }[], from: Date, to: Date) {
  const map: Record<string, number> = {};
  for (let d = startOfDay(from); d <= to; d = new Date(d.getTime() + 864e5)) map[dayKey(d)] = 0;
  for (const r of rows) { const k = dayKey(r.at); if (k in map) map[k] += r.v; }
  return Object.keys(map).sort().map((k) => ({ label: k.slice(5), v: map[k] }));
}
/** Sum `v` per month for the last `months` months → ordered [{label,v}]. */
function bucketMonthly(rows: { at: Date; v: number }[], months: number, now = new Date()) {
  const keys: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push({ key: monthKey(d), label: monthLabel(d) }); }
  const map: Record<string, number> = {}; keys.forEach((k) => (map[k.key] = 0));
  for (const r of rows) { const k = monthKey(r.at); if (k in map) map[k] += r.v; }
  return keys.map((k) => ({ label: k.label, v: map[k.key] }));
}

export async function reportsOverview(rangeIn: ReportRange = {}) {
  const now = new Date();
  const to = rangeIn.to ? endOfDay(new Date(rangeIn.to)) : now;
  const from = rangeIn.from ? startOfDay(new Date(rangeIn.from)) : startOfDay(new Date(now.getTime() - 29 * 864e5));
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5));
  const daily = spanDays <= 45;
  const todayStart = startOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMoAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const d30 = new Date(now.getTime() - 29 * 864e5);

  // ---- headline aggregates (batch 1) ----
  const [
    revAll, revToday, revMonth, revRange, ordersByStatus, ordersByType, gstPaid,
    subsByStatus, totalCustomers, newCustInRange, activeCustAgg, payingCustAgg,
  ] = await Promise.all([
    db.order.aggregate({ where: { status: "PAID" }, _sum: { totalPaise: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: todayStart } }, _sum: { totalPaise: true } }),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: monthStart } }, _sum: { totalPaise: true } }),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: from, lte: to } }, _sum: { totalPaise: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.groupBy({ by: ["type"], where: { status: "PAID" }, _count: { _all: true }, _sum: { totalPaise: true } }),
    db.order.aggregate({ where: { status: "PAID" }, _sum: { taxPaise: true } }),
    db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: from, lte: to } } }),
    db.order.findMany({ where: { status: "PAID", createdAt: { gte: d30 } }, select: { userId: true }, distinct: ["userId"] }),
    // Customers who have EVER paid — the correct CLV denominator.
    db.order.findMany({ where: { status: "PAID" }, select: { userId: true }, distinct: ["userId"] }),
  ]);

  // ---- finance + growth aggregates (batch 2) ----
  const [
    walletUsed, walletByKind, referralAgg, trialAgg, procAll, procRange, expensesAgg,
    refundsAgg, repeatCustomers, tankerCogsAll,
  ] = await Promise.all([
    db.walletTxn.aggregate({ where: { type: "DEBIT", kind: "usage" }, _sum: { amountPaise: true } }),
    db.walletTxn.groupBy({ by: ["kind", "type"], _sum: { amountPaise: true } }),
    db.referralReward.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
    db.trialCashback.aggregate({ where: { status: "CREDITED" }, _count: true, _sum: { amountPaise: true } }),
    db.procurement.aggregate({ _sum: { litres: true, amountPaise: true }, _count: true }),
    db.procurement.aggregate({ where: { collectedAt: { gte: from, lte: to } }, _sum: { litres: true, amountPaise: true } }),
    db.expense.aggregate({ where: { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { totalPaise: true } }),
    db.paymentRefund.aggregate({ _count: true, _sum: { amountPaise: true } }),
    db.order.groupBy({ by: ["userId"], where: { status: "PAID" }, _count: { _all: true }, having: { userId: { _count: { gt: 1 } } } }),
    // Milk-engine COGS: FIFO cost of milk actually SOLD. Once tankers are in use this
    // is the real cost of goods; before that it's 0 and we fall back to the old
    // procurement-cash proxy so legacy reports are unchanged.
    db.tankerConsumption.aggregate({ _sum: { costPaise: true } }),
  ]);

  // ---- trend raw rows (batch 3) ----
  const [ordersInRange, procInRange, walletUsageRange, custSince6mo, subsSince6mo, deliveriesByStatus, deliveredRows] = await Promise.all([
    db.order.findMany({ where: { status: "PAID", createdAt: { gte: from, lte: to } }, select: { createdAt: true, totalPaise: true } }),
    db.procurement.findMany({ where: { collectedAt: { gte: from, lte: to } }, select: { collectedAt: true, litres: true } }),
    db.walletTxn.findMany({ where: { type: "DEBIT", kind: "usage", createdAt: { gte: from, lte: to } }, select: { createdAt: true, amountPaise: true } }),
    db.user.findMany({ where: { role: "CUSTOMER", createdAt: { gte: sixMoAgo } }, select: { createdAt: true } }),
    db.subscription.findMany({ where: { createdAt: { gte: sixMoAgo } }, select: { createdAt: true } }),
    db.delivery.groupBy({ by: ["status"], _count: { _all: true } }),
    // Punctuality needs timestamps, not just status counts.
    db.delivery.findMany({ where: { status: "DELIVERED" }, select: { date: true, deliveredAt: true } }),
  ]);

  // ---- product/category/ops/procurement detail (batch 4) ----
  const [itemsByProduct, products, driversTop, farmersTop, bottleAgg, qualityAgg, expenseByCat] = await Promise.all([
    db.orderItem.groupBy({ by: ["productSlug", "productName"], where: { order: { status: "PAID", createdAt: { gte: from, lte: to } } }, _sum: { lineTotalPaise: true, quantity: true } }),
    db.product.findMany({ select: { slug: true, category: true } }),
    db.delivery.groupBy({ by: ["driverId"], where: { status: "DELIVERED", driverId: { not: null } }, _count: { _all: true }, _sum: { bottlesIn: true } }),
    db.procurement.groupBy({ by: ["farmerId"], _sum: { litres: true, amountPaise: true }, _count: true }),
    db.delivery.aggregate({ _sum: { bottlesOut: true, bottlesIn: true } }),
    db.qualityTest.groupBy({ by: ["passed"], _count: { _all: true } }),
    db.expense.groupBy({ by: ["categoryId"], where: { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { totalPaise: true } }),
  ]);

  // ---------- derive KPIs ----------
  const statusCount = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  const orderStatus = statusCount(ordersByStatus as never);
  const subStatus = statusCount(subsByStatus as never);
  const deliveryStatus = statusCount(deliveriesByStatus as never);
  const paidOrders = revAll._count._all || 0;
  const totalRevenue = revAll._sum.totalPaise ?? 0;
  const aovPaise = paidOrders ? Math.round(totalRevenue / paidOrders) : 0;
  const activeSubs = subStatus["ACTIVE"] ?? 0;
  const cancelledSubs = subStatus["CANCELLED"] ?? 0;
  const completedSubs = subStatus["COMPLETED"] ?? 0;
  const totalSubs = Object.values(subStatus).reduce((s, n) => s + (n as number), 0);
  const renewalRate = (completedSubs + cancelledSubs) ? Math.round((completedSubs / (completedSubs + cancelledSubs)) * 1000) / 10 : 0;
  const churnRate = totalSubs ? Math.round((cancelledSubs / totalSubs) * 1000) / 10 : 0;
  const retentionRate = Math.round((100 - churnRate) * 10) / 10;
  const wKind = (kind: string, type: "CREDIT" | "DEBIT") => (walletByKind as never as { kind: string; type: string; _sum: { amountPaise: number | null } }[]).filter((g) => g.kind === kind && g.type === type).reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0);
  const procurementCost = procAll._sum.amountPaise ?? 0;
  const expensesPaise = expensesAgg._sum.totalPaise ?? 0;
  // COGS = FIFO cost of milk sold (the tanker engine) once it's in use; else the
  // legacy procurement-cash proxy. This keeps the Reports P&L consistent with the
  // Milk Profit Center rather than double-counting two procurement models.
  const tankerCogs = tankerCogsAll._sum.costPaise ?? 0;
  const cogs = tankerCogs > 0 ? tankerCogs : procurementCost;
  const grossProfit = totalRevenue - cogs;
  const netProfit = totalRevenue - cogs - expensesPaise;

  const kpis = {
    totalRevenuePaise: totalRevenue,
    todayRevenuePaise: revToday._sum.totalPaise ?? 0,
    monthRevenuePaise: revMonth._sum.totalPaise ?? 0,
    rangeRevenuePaise: revRange._sum.totalPaise ?? 0,
    totalOrders: Object.values(orderStatus).reduce((s, n) => s + (n as number), 0),
    completedOrders: orderStatus["PAID"] ?? 0,
    rangeOrders: revRange._count._all || 0,
    activeCustomers: activeCustAgg.length,
    totalCustomers,
    newCustomers: newCustInRange,
    repeatCustomers: repeatCustomers.length,
    activeSubscriptions: activeSubs,
    subscriptionRenewalRate: renewalRate,
    customerRetentionRate: retentionRate,
    churnRate,
    aovPaise,
    // CLV = lifetime revenue per PAYING customer. Dividing by every registered user made this
    // ARPU-over-all-signups (10x understated when only 1 in 10 signups buys), and the
    // `activeCustAgg.length ?` gate zeroed it out entirely after 30 quiet days despite years
    // of history.
    clvPaise: payingCustAgg.length ? Math.round(totalRevenue / payingCustAgg.length) : 0,
    walletUsagePaise: walletUsed._sum.amountPaise ?? 0,
    referralGrowthCount: referralAgg._count,
    referralGrowthPaise: referralAgg._sum.amountPaise ?? 0,
    trialConversions: trialAgg._count,
    procurementCostPaise: procurementCost,
    cogsPaise: cogs,                                    // FIFO milk-sold cost (tanker engine) or legacy proxy
    procurementLitres: procAll._sum.litres ?? 0,
    expensesPaise,
    gstCollectedPaise: gstPaid._sum.taxPaise ?? 0,
    grossProfitPaise: grossProfit,
    netProfitPaise: netProfit,
  };

  // ---------- charts ----------
  const revTrendRows = ordersInRange.map((o) => ({ at: o.createdAt, v: o.totalPaise }));
  const ordTrendRows = ordersInRange.map((o) => ({ at: o.createdAt, v: 1 }));
  const charts = {
    granularity: daily ? "day" : "month",
    revenueTrend: daily ? bucketDaily(revTrendRows, from, to) : bucketMonthly(revTrendRows, 6, now),
    ordersTrend: daily ? bucketDaily(ordTrendRows, from, to) : bucketMonthly(ordTrendRows, 6, now),
    procurementTrend: daily ? bucketDaily(procInRange.map((p) => ({ at: p.collectedAt, v: p.litres })), from, to) : bucketMonthly(procInRange.map((p) => ({ at: p.collectedAt, v: p.litres })), 6, now),
    walletUsage: daily ? bucketDaily(walletUsageRange.map((w) => ({ at: w.createdAt, v: w.amountPaise })), from, to) : bucketMonthly(walletUsageRange.map((w) => ({ at: w.createdAt, v: w.amountPaise })), 6, now),
    customerGrowth: bucketMonthly(custSince6mo.map((u) => ({ at: u.createdAt, v: 1 })), 6, now),
    subscriptionGrowth: bucketMonthly(subsSince6mo.map((s) => ({ at: s.createdAt, v: 1 })), 6, now),
    ordersByStatus: orderStatus,
    subscriptionsByStatus: subStatus,
    deliveriesByStatus: deliveryStatus,
  };

  // ---------- category tables ----------
  const catBySlug: Record<string, string> = {};
  products.forEach((p) => (catBySlug[p.slug] = p.category || "Other"));
  const productSales = (itemsByProduct as never as { productSlug: string; productName: string; _sum: { lineTotalPaise: number | null; quantity: number | null } }[])
    .map((r) => ({ slug: r.productSlug, name: r.productName, qty: r._sum.quantity ?? 0, revenuePaise: r._sum.lineTotalPaise ?? 0, category: catBySlug[r.productSlug] || "Other" }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise);
  const catMap: Record<string, { qty: number; revenuePaise: number }> = {};
  productSales.forEach((p) => { const c = catMap[p.category] || { qty: 0, revenuePaise: 0 }; c.qty += p.qty; c.revenuePaise += p.revenuePaise; catMap[p.category] = c; });
  const categorySales = Object.keys(catMap).map((k) => ({ category: k, ...catMap[k] })).sort((a, b) => b.revenuePaise - a.revenuePaise);

  // driver / farmer names for the ops + procurement tables
  const driverIds = (driversTop as never as { driverId: string | null }[]).map((d) => d.driverId).filter(Boolean) as string[];
  const farmerIds = (farmersTop as never as { farmerId: string }[]).map((f) => f.farmerId);
  const [driverRows, farmerRows] = await Promise.all([
    driverIds.length ? db.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, user: { select: { name: true } } } }) : Promise.resolve([]),
    farmerIds.length ? db.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const driverName = Object.fromEntries(driverRows.map((d) => [d.id, d.user?.name ?? "—"]));
  const farmerName = Object.fromEntries(farmerRows.map((f) => [f.id, f.name]));
  const driverPerf = (driversTop as never as { driverId: string; _count: { _all: number }; _sum: { bottlesIn: number | null } }[])
    .map((d) => ({ driver: driverName[d.driverId] || "—", delivered: d._count._all, bottlesIn: d._sum.bottlesIn ?? 0 }))
    .sort((a, b) => b.delivered - a.delivered).slice(0, 10);
  const farmerPerf = (farmersTop as never as { farmerId: string; _count: number; _sum: { litres: number | null; amountPaise: number | null } }[])
    .map((f) => ({ farmer: farmerName[f.farmerId] || "—", batches: f._count, litres: f._sum.litres ?? 0, payablePaise: f._sum.amountPaise ?? 0 }))
    .sort((a, b) => b.litres - a.litres).slice(0, 10);

  const qPass = (qualityAgg as never as { passed: boolean; _count: { _all: number } }[]).find((q) => q.passed)?._count._all ?? 0;
  const qFail = (qualityAgg as never as { passed: boolean; _count: { _all: number } }[]).find((q) => !q.passed)?._count._all ?? 0;
  const bottlesOut = bottleAgg._sum.bottlesOut ?? 0, bottlesIn = bottleAgg._sum.bottlesIn ?? 0;

  // Punctuality against the configured SLA promise, anchored to each delivery's own IST day.
  const promiseMin = await slaPromiseMin();
  const onTimeCount = deliveredRows.filter((d) => deliveredOnTime(d.deliveredAt, d.date, promiseMin)).length;
  const deliveredCount = deliveryStatus["DELIVERED"] ?? 0;
  const failedCount = deliveryStatus["FAILED"] ?? 0;
  const totalDeliveries = Object.values(deliveryStatus).reduce((s, n) => s + (n as number), 0);

  const categories = {
    sales: {
      daily: (daily ? bucketDaily(revTrendRows, from, to) : bucketMonthly(revTrendRows, 6, now)).map((r, i) => {
        const orders = (daily ? bucketDaily(ordTrendRows, from, to) : bucketMonthly(ordTrendRows, 6, now))[i];
        return { date: r.label, revenuePaise: r.v, orders: orders ? orders.v : 0 };
      }),
      byProduct: productSales.slice(0, 20),
      byCategory: categorySales,
      byType: (ordersByType as never as { type: string; _count: { _all: number }; _sum: { totalPaise: number | null } }[]).map((t) => ({ type: t.type, count: t._count._all, revenuePaise: t._sum.totalPaise ?? 0 })),
    },
    customers: {
      total: totalCustomers, active: activeCustAgg.length, inactive: Math.max(0, totalCustomers - activeCustAgg.length),
      repeat: repeatCustomers.length, newInRange: newCustInRange, retentionRate, growth: charts.customerGrowth,
    },
    subscriptions: { byStatus: subStatus, active: activeSubs, cancelled: cancelledSubs, completed: completedSubs, renewalRate, churnRate, growth: charts.subscriptionGrowth },
    financial: {
      revenuePaise: totalRevenue, expensesPaise, procurementCostPaise: procurementCost, grossProfitPaise: grossProfit, netProfitPaise: netProfit,
      gstCollectedPaise: gstPaid._sum.taxPaise ?? 0, refunds: { count: refundsAgg._count, amountPaise: refundsAgg._sum.amountPaise ?? 0 },
      wallet: { creditedPaise: (walletByKind as never as { type: string; _sum: { amountPaise: number | null } }[]).filter((g) => g.type === "CREDIT").reduce((s, g) => s + (g._sum.amountPaise ?? 0), 0), usedPaise: walletUsed._sum.amountPaise ?? 0, cashbackPaise: wKind("cashback", "CREDIT"), referralPaise: wKind("referral", "CREDIT"), refundPaise: wKind("refund", "CREDIT") },
      expensesByCategory: expenseByCat as never,
    },
    operations: {
      deliveries: { total: totalDeliveries, delivered: deliveredCount, failed: failedCount, pending: totalDeliveries - deliveredCount - failedCount, byStatus: deliveryStatus },
      // Was deliveredCount / ALL deliveries (every status, all-time — including stops merely
      // SCHEDULED for tomorrow), and "DELIVERED" says nothing about punctuality: 100 perfectly
      // on-time deliveries plus 50 scheduled read 66.7%, dropping further every time tomorrow
      // was planned. And FAILED is not "late". Now measured against the SLA promise.
      onTimeRate: deliveredRows.length ? Math.round((onTimeCount / deliveredRows.length) * 1000) / 10 : 0,
      lateDeliveries: deliveredRows.length - onTimeCount,
      driverPerformance: driverPerf,
      bottleReturnRate: bottlesOut ? Math.round((bottlesIn / bottlesOut) * 1000) / 10 : 0,
      bottlesOut, bottlesIn,
    },
    procurement: {
      litres: procAll._sum.litres ?? 0, costPaise: procurementCost, batches: procAll._count,
      rangeLitres: procRange._sum.litres ?? 0, rangeCostPaise: procRange._sum.amountPaise ?? 0,
      farmerPerformance: farmerPerf, quality: { passed: qPass, failed: qFail, passRate: (qPass + qFail) ? Math.round((qPass / (qPass + qFail)) * 1000) / 10 : 0 },
    },
    marketing: {
      referral: { count: referralAgg._count, amountPaise: referralAgg._sum.amountPaise ?? 0 },
      trialConversions: trialAgg._count, trialCashbackPaise: trialAgg._sum.amountPaise ?? 0,
    },
  };

  return {
    meta: { from: dayKey(from), to: dayKey(to), spanDays, granularity: charts.granularity, generatedAt: now.toISOString() },
    kpis, charts, categories,
  };
}

export type ReportsOverview = Awaited<ReturnType<typeof reportsOverview>>;
