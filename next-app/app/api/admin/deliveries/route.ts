/* GET /api/admin/deliveries — all deliveries for staff (deliveries:view).
   Optional ?status=, ?when=today|upcoming|past, ?driverId=. */
import { NextRequest } from "next/server";
import type { DeliveryStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED", "FAILED", "SKIPPED"];

export const GET = route("admin.deliveries.list", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const when = url.searchParams.get("when");
  const driverId = url.searchParams.get("driverId");

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const dateFilter: Prisma.DeliveryWhereInput =
    when === "today" ? { date: { gte: start, lte: end } }
    : when === "upcoming" ? { date: { gt: end } }
    : when === "past" ? { date: { lt: start } }
    : {};

  const rows = await db.delivery.findMany({
    where: {
      ...dateFilter,
      ...(status && STATUSES.includes(status) ? { status: status as DeliveryStatus } : {}),
      ...(driverId ? { driverId } : {}),
    },
    orderBy: [{ date: "desc" }, { sequence: "asc" }],
    take: 150,
    select: {
      id: true, date: true, status: true, slot: true, sequence: true, bottlesIn: true, cashCollected: true, bottleCount: true,
      driver: { select: { id: true, employeeId: true, user: { select: { name: true } } } },
      subscription: { select: { user: { select: { name: true } }, address: { select: { city: true, pincode: true } } } },
      order: { select: { user: { select: { name: true } } } },
    },
  });

  const deliveries = rows.map(({ subscription, order, driver, ...d }) => ({
    ...d,
    customer: subscription?.user?.name ?? order?.user?.name ?? "—",
    area: subscription?.address ? `${subscription.address.city} ${subscription.address.pincode}` : "—",
    driver: driver ? { id: driver.id, name: driver.user.name, employeeId: driver.employeeId } : null,
  }));
  return ok({ deliveries });
});
