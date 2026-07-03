/* GET /api/deliveries — the signed-in customer's deliveries (via their
   subscriptions or one-off orders). Used by Deliveries, Tracking and the
   Calendar. Returns newest-first; the client splits upcoming vs past. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("deliveries.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const rows = await db.delivery.findMany({
    where: { OR: [{ subscription: { userId } }, { order: { userId } }] },
    orderBy: { date: "desc" },
    take: 180,
    select: {
      id: true, date: true, status: true, slot: true, sequence: true,
      deliveredAt: true, bottlesOut: true, bottlesIn: true, customerRemark: true,
      driver: { select: { user: { select: { name: true } } } },
    },
  });
  // flatten the driver name (it lives on the related User)
  const deliveries = rows.map(({ driver, ...d }) => ({ ...d, driver: driver ? { name: driver.user.name } : null }));
  return ok({ deliveries });
});
