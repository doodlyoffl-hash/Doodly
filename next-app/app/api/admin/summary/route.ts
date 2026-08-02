/* GET /api/admin/summary — live KPIs for the admin dashboard (dashboard:view):
   revenue (today + month), active subscriptions, customers, pending deliveries,
   bottles in the field, available products, orders today. */
import { NextRequest } from "next/server";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { dailyPnl, monthlyPnl } from "@/lib/milk/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PENDING: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];

export const GET = route("admin.summary", async (req: NextRequest) => {
  requirePermission(req, "dashboard", "view");

  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 864e5);

  // Revenue = the SAME recognised, delivery-based P&L the Milk Profit Centre uses (so the
  // dashboard headline and the Profit Centre never disagree), with billed intake kept alongside.
  const [pnlToday, pnlMonth, revToday, revMonth, activeSubs, customers, newCustomers, pendingDeliveries, ordersToday, products, bottleGroups] = await Promise.all([
    dailyPnl(),
    monthlyPnl(),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: startToday } }, _sum: { totalPaise: true } }),
    db.order.aggregate({ where: { status: "PAID", createdAt: { gte: startMonth } }, _sum: { totalPaise: true } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { role: "CUSTOMER", deletedAt: null } }),
    db.user.count({ where: { role: "CUSTOMER", deletedAt: null, createdAt: { gte: weekAgo } } }),
    db.delivery.count({ where: { status: { in: PENDING }, date: { gte: startToday } } }),
    db.order.count({ where: { createdAt: { gte: startToday } } }),
    db.product.count({ where: { status: "AVAILABLE" } }),
    db.bottleLedger.groupBy({ by: ["event"], _sum: { qty: true } }),
  ]);

  const bottle = (e: string) => bottleGroups.find((g) => g.event === e)?._sum.qty ?? 0;
  const bottlesInField = Math.max(0, bottle("ISSUED") - bottle("RETURNED") - bottle("LOST"));

  return ok({
    summary: {
      revenueTodayPaise: pnlToday.revenuePaise,           // recognised (delivery-based) — matches Profit Centre
      revenueMonthPaise: pnlMonth.revenuePaise,
      billedTodayPaise: revToday._sum.totalPaise ?? 0,    // billed intake (order-gross), for reference
      billedMonthPaise: revMonth._sum.totalPaise ?? 0,
      profitMonthPaise: pnlMonth.netProfitPaise,          // net profit (revenue − COGS − expenses)
      activeSubscriptions: activeSubs,
      customers,
      newCustomers,
      pendingDeliveries,
      ordersToday,
      products,
      bottlesInField,
    },
  });
});
