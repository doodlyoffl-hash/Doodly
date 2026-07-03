/* GET /api/account/summary — live KPIs for the customer dashboard:
   next delivery, wallet balance, bottles pending, loyalty points,
   the active subscription, and orders/deliveries/invoices counts. */
import { NextRequest } from "next/server";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPEN_STATUSES: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];

export const GET = route("account.summary", async (req: NextRequest) => {
  const userId = requireUserId(req);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, walletPaise: true, loyaltyPoints: true },
  });
  if (!user) throw Errors.notFound("Account not found.");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [activeSub, nextDelivery, bottleGroups, ordersCount, deliveriesCount, invoicesCount] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true, days: true } },
        items: { include: { variant: { select: { label: true, ml: true, product: { select: { name: true } } } } } },
      },
    }),
    db.delivery.findFirst({
      where: { subscription: { userId }, status: { in: OPEN_STATUSES }, date: { gte: startOfToday } },
      orderBy: { date: "asc" },
      select: { date: true, status: true, slot: true },
    }),
    db.bottleLedger.groupBy({ by: ["event"], where: { userId }, _sum: { qty: true } }),
    db.order.count({ where: { userId } }),
    db.delivery.count({ where: { OR: [{ subscription: { userId } }, { order: { userId } }] } }),
    db.invoice.count({ where: { userId } }),
  ]);

  const bottleSum = (e: string) => bottleGroups.find((g) => g.event === e)?._sum.qty ?? 0;
  const bottlesPending = Math.max(0, bottleSum("ISSUED") - bottleSum("RETURNED") - bottleSum("LOST"));

  return ok({
    summary: {
      name: user.name,
      walletPaise: user.walletPaise,
      loyaltyPoints: user.loyaltyPoints,
      bottlesPending,
      nextDelivery: nextDelivery ? { date: nextDelivery.date, status: nextDelivery.status, slot: nextDelivery.slot } : null,
      activeSubscription: activeSub
        ? {
            id: activeSub.id,
            planName: activeSub.plan.name,
            status: activeSub.status,
            nextDeliveryAt: activeSub.nextDeliveryAt,
            items: activeSub.items.map((i) => ({ qty: i.qty, label: i.variant.label, product: i.variant.product.name })),
          }
        : null,
      counts: { orders: ordersCount, deliveries: deliveriesCount, invoices: invoicesCount },
    },
  });
});
