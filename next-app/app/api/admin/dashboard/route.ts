/* GET /api/admin/dashboard — real, record-derived data for the admin ops
   dashboard. Returns a daily metric series (one record per calendar day, IST)
   + point-in-time figures, matching the shape the dashboard's data layer
   expects — so every existing KPI card and chart renders LIVE numbers with no
   UI change. Empty DB → all zeros (honest empty state). RBAC: dashboard.view. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS = 370;
const IST_MS = 5.5 * 3600 * 1000;
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const rupees = (paise: number) => Math.round(paise) / 100;

export const GET = route("admin.dashboard", async (req: NextRequest) => {
  requirePermission(req, "dashboard", "view");
  const now = new Date();
  const from = new Date(now.getTime() - DAYS * 86400000);

  const [orders, payments, deliveries, variants, procurements, newCusts, totalCustomers, activeSubs, pausedSubs, farmers, routes, activeExecs, outstandingAgg, bizOrders] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, status: true, cancelledAt: true, taxPaise: true } }),
    db.payment.findMany({ where: { status: "PAID", createdAt: { gte: from } }, select: { createdAt: true, amountPaise: true } }),
    db.delivery.findMany({
      where: { date: { gte: from } },
      select: {
        date: true, status: true, bottlesIn: true, bottleCount: true,
        subscription: { select: { items: { select: { qty: true, variant: { select: { ml: true } } } } } },
        order: { select: { items: { select: { productSlug: true, variantLabel: true } } } },
      },
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
    db.procurement.findMany({ where: { collectedAt: { gte: from }, accepted: true }, select: { collectedAt: true, litres: true } }).catch(() => []),
    db.user.findMany({ where: { role: "CUSTOMER", deletedAt: null, createdAt: { gte: from } }, select: { createdAt: true } }),
    db.user.count({ where: { role: "CUSTOMER", deletedAt: null } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.count({ where: { status: { in: ["PAUSED", "VACATION"] } } }),
    db.farmer.count({ where: { deletedAt: null } }).catch(() => 0),
    db.route.count({ where: { deletedAt: null } }).catch(() => db.route.count().catch(() => 0)),
    db.driver.count({ where: { deletedAt: null } }).catch(() => db.driver.count().catch(() => 0)),
    db.order.aggregate({ _sum: { totalPaise: true }, where: { status: "PENDING", cancelledAt: null } }),
    db.businessOrder.findMany({ where: { status: { not: "CANCELLED" } }, select: { totalPaise: true, paidPaise: true } }).catch(() => [] as { totalPaise: number; paidPaise: number }[]),
  ]);

  const b2bOutstandingPaise = bizOrders.reduce((s, o) => s + Math.max(0, (o.totalPaise || 0) - (o.paidPaise || 0)), 0);
  const point = { totalCustomers, activeSubs, trialSubs: 0, pausedSubs, farmers, routes, activeExecs,
    outstandingPaise: (outstandingAgg._sum.totalPaise ?? 0) + b2bOutstandingPaise, b2bOrders: bizOrders.length, b2bOutstandingPaise };

  const map: Record<string, Record<string, number | string>> = {};
  const rec = (dstr: string) => {
    if (!map[dstr]) map[dstr] = {
      date: dstr, orders: 0, revenue: 0, completed: 0, cancelled: 0, pending: 0, newCustomers: 0,
      deliveries: 0, deliveriesCompleted: 0, deliveriesFailed: 0, deliveriesDelayed: 0, bottlesReturned: 0,
      milkCollected: 0, milkDelivered: 0, farmers, qualityChecks: 0, paymentsReceived: 0, outstandingDelta: 0,
      referralCount: 0, referralRewards: 0, walletUsed: 0, gst: 0, b2bRevenue: 0, routes,
    };
    return map[dstr] as Record<string, number>;
  };
  orders.forEach((o) => {
    const d = rec(istDate(o.createdAt));
    if (o.cancelledAt) d.cancelled++; else { d.orders++; if (o.status === "PAID") d.completed++; else if (o.status === "PENDING") d.pending++; }
    d.gst += rupees(o.taxPaise || 0);
  });
  payments.forEach((p) => { const d = rec(istDate(p.createdAt)); d.revenue += rupees(p.amountPaise); d.paymentsReceived += rupees(p.amountPaise); });
  // milkDelivered was incremented by 1 PER DELIVERY — a duplicate of deliveriesCompleted that
  // couldn't tell 40 x 500 ml (20 L) from 40 x 1 L (40 L). Same bug class as lib/delivery/stats.ts.
  // Now: bottles on the stop x the real bottle size. milkCollected was hard-zero; fill it from
  // accepted Procurement litres.
  const normLabel = (x?: string | null) => (x ?? "").toLowerCase().replace(/\s+/g, "");
  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);
  const litresOf = (dv: (typeof deliveries)[number]) => {
    const subItems = dv.subscription?.items ?? [];
    if (subItems.length) return subItems.reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0) / 1000;
    const oi = (dv.order?.items ?? [])[0];
    const ml = oi ? (mlByKey.get(`${oi.productSlug}|${normLabel(oi.variantLabel)}`) ?? 1000) : 1000;
    return (ml * (dv.bottleCount || 1)) / 1000;
  };
  deliveries.forEach((dv) => { const d = rec(istDate(dv.date)); d.deliveries++; if (dv.status === "DELIVERED") { d.deliveriesCompleted++; d.milkDelivered += litresOf(dv); } else if (dv.status === "FAILED") d.deliveriesFailed++; d.bottlesReturned += dv.bottlesIn || 0; });
  procurements.forEach((p) => { const d = rec(istDate(p.collectedAt)); d.milkCollected += p.litres; });
  newCusts.forEach((u) => { rec(istDate(u.createdAt)).newCustomers++; });

  const series = Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1));
  return ok({ series, point });
});
