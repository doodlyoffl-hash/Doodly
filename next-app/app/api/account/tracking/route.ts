/* GET /api/account/tracking — the signed-in customer's live delivery tracking.
   Returns today's active delivery status, its destination (the delivery
   address, with coordinates), and — ONLY while it is en route — the assigned
   executive's live GPS position (from Driver.lat/lng/lastSeenAt). Driver
   position is never exposed unless a delivery to THIS customer is actively out
   for delivery. If the destination address has no coordinates yet (no Google
   pin), it is geocoded once (keyless) and cached to the Address so the map has
   a destination even without a Maps key. */
import { NextRequest } from "next/server";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { geocodeAddress } from "@/lib/geo/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EN_ROUTE: DeliveryStatus[] = ["OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
const ACTIVE: DeliveryStatus[] = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];
const ADDR_SELECT = { id: true, label: true, lat: true, lng: true, houseNo: true, buildingName: true, street: true, area: true, landmark: true, city: true, pincode: true };

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
      subscription: { select: { address: { select: ADDR_SELECT } } },
    },
  });

  // Destination = the subscription's delivery address (fallback: the customer's default address).
  let addr = d?.subscription?.address ?? null;
  if (d && !addr) {
    addr = await db.address.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { label: "asc" }], select: ADDR_SELECT });
  }
  // Geocode-and-cache once if the destination has no coordinates (no Google pin dropped).
  if (addr && (addr.lat == null || addr.lng == null)) {
    const geo = await geocodeAddress(addr);
    if (geo) {
      addr.lat = geo.lat; addr.lng = geo.lng;
      try { await db.address.update({ where: { id: addr.id }, data: { lat: geo.lat, lng: geo.lng } }); } catch { /* cache best-effort */ }
    }
  }
  const dest = addr && addr.lat != null && addr.lng != null ? { lat: addr.lat, lng: addr.lng, label: addr.label || "Delivery address" } : null;

  const enRoute = !!d && EN_ROUTE.includes(d.status);
  const driver = enRoute && d!.driver && d!.driver.lat != null && d!.driver.lng != null
    ? { name: d!.driver.user?.name ?? "Delivery executive", lat: d!.driver.lat, lng: d!.driver.lng, lastSeenAt: d!.driver.lastSeenAt }
    : null;

  return ok({ active: !!d, deliveryId: d?.id ?? null, status: d?.status ?? null, enRoute, dest, driver });
});
