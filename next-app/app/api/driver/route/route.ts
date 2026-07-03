/* GET /api/driver/route — the signed-in delivery executive's assigned stops
   (their own Driver record only), with customer, address and items. Powers the
   /driver route/deliveries/bottles/cash/completed/history pages. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("driver.route", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const driver = await db.driver.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
  if (!driver) throw Errors.forbidden("No delivery profile is linked to this account.");

  const rows = await db.delivery.findMany({
    where: { driverId: driver.id },
    orderBy: [{ date: "desc" }, { sequence: "asc" }],
    take: 200,
    select: {
      id: true, date: true, status: true, slot: true, sequence: true,
      bottlesOut: true, bottlesIn: true, cashCollected: true, customerRemark: true, deliveredAt: true, bottleCount: true,
      subscription: {
        select: {
          user: { select: { name: true, phone: true } },
          address: { select: { line1: true, line2: true, city: true, pincode: true, lat: true, lng: true } },
          items: { select: { qty: true, variant: { select: { label: true, product: { select: { name: true } } } } } },
        },
      },
      order: { select: { user: { select: { name: true, phone: true } } } },
    },
  });

  const stops = rows.map(({ subscription, order, ...d }) => ({
    ...d,
    customer: subscription?.user ?? order?.user ?? { name: null, phone: null },
    address: subscription?.address ?? null,
    items: subscription?.items.map((i) => ({ product: i.variant.product.name, label: i.variant.label, qty: i.qty })) ?? [],
  }));

  return ok({
    stops,
    driver: { name: driver.user.name, employeeId: driver.employeeId, vehicleNo: driver.vehicleNo, rating: driver.rating },
  });
});
