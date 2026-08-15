/* GET /api/admin/orders/reports — order-channel analytics (assistedOrders:view).
   Breaks every order down by source (website | assisted | simple_mode) with order
   count, paid count and revenue, plus per-staff totals for assisted orders. Pure read.
   Optional ?from=&to= (ISO dates; default = last 30 days). Powers the Assisted-Order
   report + the website-vs-assisted-vs-simple analytics (Part 9/10). */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["website", "assisted", "simple_mode"];

export const GET = route("admin.orders.reports", async (req: NextRequest) => {
  requirePermission(req, "assistedOrders", "view");
  const q = new URL(req.url).searchParams;
  const from = q.get("from") ? new Date(q.get("from")!) : new Date(Date.now() - 30 * 86_400_000);
  const to = q.get("to") ? new Date(q.get("to")!) : new Date();
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return ok({ channels: [], staff: [], from: null, to: null });
  const where = { createdAt: { gte: from, lte: to } };

  const [bySource, paidBySource, byStaff] = await Promise.all([
    db.order.groupBy({ by: ["source"], where, _count: { _all: true }, _sum: { totalPaise: true } }),
    db.order.groupBy({ by: ["source"], where: { ...where, status: "PAID" }, _count: { _all: true }, _sum: { totalPaise: true } }),
    db.order.groupBy({ by: ["placedById", "placedByRole"], where: { ...where, source: "assisted" }, _count: { _all: true }, _sum: { totalPaise: true } }),
  ]);

  const channels = SOURCES.map((s) => {
    const c = bySource.find((x) => x.source === s);
    const p = paidBySource.find((x) => x.source === s);
    return { source: s, orders: c?._count._all ?? 0, revenuePaise: c?._sum.totalPaise ?? 0, paidOrders: p?._count._all ?? 0, paidRevenuePaise: p?._sum.totalPaise ?? 0 };
  });
  const staff = byStaff
    .map((x) => ({ staffId: x.placedById, role: x.placedByRole, orders: x._count._all, revenuePaise: x._sum.totalPaise ?? 0 }))
    .sort((a, b) => b.orders - a.orders);

  return ok({ from: from.toISOString(), to: to.toISOString(), channels, staff });
});
