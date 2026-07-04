/* GET /api/delivery/my-route — the signed-in delivery executive's own route.
   Scoped hard: role must be delivery_executive (or super_admin testing), and
   only deliveries assigned to THEIR Driver record are returned. Defaults to
   today; when today has no assignments it falls back to the most recent day
   that does, so the portal always shows the executive's real work. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "assigned", ASSIGNED: "assigned", ACCEPTED: "assigned", PACKED: "assigned",
  OUT_FOR_DELIVERY: "onway", ON_THE_WAY: "onway", REACHED: "reached",
  DELIVERED: "delivered", FAILED: "assigned", SKIPPED: "delivered",
};

export const GET = route("delivery.myRoute", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const role = readRole(req);
  if (role !== "delivery_executive" && role !== "super_admin") throw Errors.forbidden("Executive portal only.");

  const driver = await db.driver.findFirst({ where: { userId, deletedAt: null }, include: { user: { select: { name: true } } } });
  if (!driver) throw Errors.notFound("No delivery-executive profile is linked to this account.");

  const sp = new URL(req.url).searchParams;
  let dayStart: Date;
  if (sp.get("date")) {
    dayStart = new Date(`${sp.get("date")}T00:00:00`);
    if (isNaN(dayStart.getTime())) throw Errors.badRequest("Invalid date.");
  } else {
    dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  }
  let dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const include = {
    subscription: { include: { user: { select: { id: true, name: true, phone: true } }, address: true, items: { include: { variant: { select: { label: true, product: { select: { name: true } } } } } }, plan: { select: { name: true } } } },
    order: { include: { user: { select: { id: true, name: true, phone: true } }, payment: { select: { method: true, status: true } } } },
    route: { select: { id: true, name: true, code: true } },
  } as const;

  let rows = await db.delivery.findMany({ where: { driverId: driver.id, date: { gte: dayStart, lt: dayEnd } }, orderBy: [{ sequence: "asc" }, { date: "asc" }], include });

  // fallback: latest day that has assignments (keeps the portal demonstrable with seeded data)
  let fellBack = false;
  if (!rows.length && !sp.get("date")) {
    const latest = await db.delivery.findFirst({ where: { driverId: driver.id }, orderBy: { date: "desc" }, select: { date: true } });
    if (latest) {
      dayStart = new Date(latest.date); dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(dayStart.getTime() + 86_400_000);
      rows = await db.delivery.findMany({ where: { driverId: driver.id, date: { gte: dayStart, lt: dayEnd } }, orderBy: [{ sequence: "asc" }, { date: "asc" }], include });
      fellBack = true;
    }
  }

  const stops = rows.map((d, i) => {
    const cust = d.subscription?.user ?? d.order?.user ?? null;
    const addr = d.subscription?.address ?? null;
    const item = d.subscription?.items?.[0];
    const cod = d.order && d.order.status === "PENDING" && d.order.payment?.method === "CASH";
    return {
      id: d.id, seq: d.sequence ?? i + 1,
      name: cust?.name ?? "Customer", mobile: cust?.phone ?? "",
      label: addr?.label ?? "Home",
      address: addr ? [addr.line1, addr.line2, `${addr.city} ${addr.pincode}`].filter(Boolean).join(", ") : "Address on file",
      area: addr?.city ?? "", pincode: addr?.pincode ?? "",
      lat: addr?.lat ?? null, lng: addr?.lng ?? null,
      plan: d.subscription?.plan?.name ?? (d.order ? "One-time order" : "Delivery"),
      qty: item?.qty ?? 1,
      itemLabel: item ? `${item.variant.label} ${item.variant.product.name}` : "",
      instructions: addr?.deliveryNote ?? "",
      bottlesExpected: d.bottleCount ?? 1,
      bottlesCollected: d.bottlesIn ?? 0,
      payment: cod && d.order ? `COD ₹${Math.round(d.order.totalPaise / 100)}` : "Paid",
      status: STATUS_MAP[d.status] ?? "assigned",
      slot: d.slot, deliveredAt: d.deliveredAt,
    };
  });

  const dateLabel = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
  return ok({
    driver: { name: driver.user?.name ?? "Executive", employeeId: driver.employeeId, vehicleNo: driver.vehicleNo, rating: driver.rating },
    route: rows[0]?.route ? { name: rows[0].route.name, code: rows[0].route.code } : null,
    date: dateLabel,
    isFallbackDate: fellBack,
    stops,
  });
});
