/* GET /api/admin/dashboard — real, record-derived KPIs for the admin ops
   dashboard. Every figure is a live DB aggregate (no fabricated numbers).
   RBAC: dashboard.view. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.dashboard", async (req: NextRequest) => {
  requirePermission(req, "dashboard", "view");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    revTotal, revMonth,
    ordersTotal, ordersMonth, ordersPending,
    activeSubs,
    custTotal, custNewMonth,
    delToday, delDeliveredToday, bottlesAgg,
  ] = await Promise.all([
    db.payment.aggregate({ _sum: { amountPaise: true }, where: { status: "PAID" } }),
    db.payment.aggregate({ _sum: { amountPaise: true }, where: { status: "PAID", createdAt: { gte: monthStart } } }),
    db.order.count({ where: { cancelledAt: null } }),
    db.order.count({ where: { cancelledAt: null, createdAt: { gte: monthStart } } }),
    db.order.count({ where: { status: "PENDING", cancelledAt: null } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { role: "CUSTOMER", deletedAt: null } }),
    db.user.count({ where: { role: "CUSTOMER", deletedAt: null, createdAt: { gte: monthStart } } }),
    db.delivery.count({ where: { date: { gte: dayStart } } }),
    db.delivery.count({ where: { date: { gte: dayStart }, status: "DELIVERED" } }),
    db.delivery.aggregate({ _sum: { bottlesOut: true, bottlesIn: true }, where: { date: { gte: dayStart } } }),
  ]);

  return ok({
    revenue: { totalPaise: revTotal._sum.amountPaise ?? 0, monthPaise: revMonth._sum.amountPaise ?? 0 },
    orders: { total: ordersTotal, month: ordersMonth, pending: ordersPending },
    subscriptions: { active: activeSubs },
    customers: { total: custTotal, newThisMonth: custNewMonth },
    deliveriesToday: { total: delToday, delivered: delDeliveredToday, pending: Math.max(0, delToday - delDeliveredToday) },
    bottlesToday: { out: bottlesAgg._sum.bottlesOut ?? 0, in: bottlesAgg._sum.bottlesIn ?? 0 },
  });
});
