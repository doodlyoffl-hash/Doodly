/* GET /api/account/tracking — the signed-in customer's live delivery tracking.
   Returns today's active delivery status and, ONLY while it is en route, the
   assigned executive's live GPS position (from Driver.lat/lng/lastSeenAt).
   Driver position is never exposed unless a delivery to THIS customer is
   actively out for delivery. */
import { NextRequest } from "next/server";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EN_ROUTE: DeliveryStatus[] = ["OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
const ACTIVE: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];

export const GET = route("account.tracking", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const start = new Date(); start.setHours(0, 0, 0, 0);

  const d = await db.delivery.findFirst({
    where: {
      OR: [{ subscription: { userId } }, { order: { userId } }],
      status: { in: ACTIVE },
      date: { gte: start },
    },
    orderBy: [{ date: "asc" }],
    select: {
      id: true, status: true, date: true, deliveredAt: true,
      driver: { select: { lat: true, lng: true, lastSeenAt: true, user: { select: { name: true } } } },
    },
  });

  const enRoute = !!d && EN_ROUTE.includes(d.status);
  const driver = enRoute && d!.driver && d!.driver.lat != null && d!.driver.lng != null
    ? { name: d!.driver.user?.name ?? "Delivery executive", lat: d!.driver.lat, lng: d!.driver.lng, lastSeenAt: d!.driver.lastSeenAt }
    : null;

  return ok({
    active: !!d,
    deliveryId: d?.id ?? null,
    status: d?.status ?? null,
    enRoute,
    driver,
  });
});
