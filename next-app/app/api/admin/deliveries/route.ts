/* GET /api/admin/deliveries — deliveries for staff (deliveries:view), enriched for
   the date-based Delivery Management board.
   ?date=YYYY-MM-DD → that IST day (default: today IST). Back-compat: ?when=today|
   upcoming|past, ?status=, ?driverId=. */
import { NextRequest } from "next/server";
import type { DeliveryStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { istDayWindow } from "@/lib/delivery/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["SCHEDULED", "ASSIGNED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED", "DELIVERED", "FAILED", "SKIPPED"];
const ADDR = { select: { houseNo: true, buildingName: true, floor: true, line1: true, line2: true, street: true, area: true, city: true, state: true, pincode: true, landmark: true, lat: true, lng: true, deliveryNote: true } } as const;

type Addr = Prisma.AddressGetPayload<typeof ADDR> | null | undefined;
function fmtAddr(a: Addr): string {
  if (!a) return "—";
  // Prefer the structured last-mile fields; fall back to the composed line1/line2 only
  // when no structured fields exist (line1 is itself composed from house/building).
  const structured = [a.houseNo, a.buildingName, a.floor, a.street].filter(Boolean);
  const base = structured.length ? structured : [a.line1, a.line2].filter(Boolean);
  const parts = [...base, a.area, a.city, a.state].filter(Boolean);
  return (parts.join(", ") + (a.pincode ? " " + a.pincode : "")) || "—";
}

export const GET = route("admin.deliveries.list", async (req: NextRequest) => {
  requirePermission(req, "deliveries", "view");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const driverId = url.searchParams.get("driverId");
  const dateStr = url.searchParams.get("date");
  const when = url.searchParams.get("when");

  // Date-based is the default. `when` (today/upcoming/past) kept for back-compat.
  let dateFilter: Prisma.DeliveryWhereInput;
  if (!dateStr && (when === "upcoming" || when === "past")) {
    const { start, end } = istDayWindow();
    dateFilter = when === "upcoming" ? { date: { gte: end } } : { date: { lt: start } };
  } else {
    const { start, end } = istDayWindow(dateStr);   // given day, or today IST
    dateFilter = { date: { gte: start, lt: end } };
  }

  const rows = await db.delivery.findMany({
    where: { ...dateFilter, ...(status && STATUSES.includes(status) ? { status: status as DeliveryStatus } : {}), ...(driverId ? { driverId } : {}) },
    orderBy: [{ slot: "asc" }, { sequence: "asc" }, { date: "asc" }],
    take: 1000,
    select: {
      id: true, orderId: true, date: true, status: true, packingStatus: true, slot: true, sequence: true,
      bottleCount: true, bottlesIn: true, cashCollected: true, customerRemark: true,
      driver: { select: { id: true, employeeId: true, user: { select: { name: true } } } },
      route: { select: { id: true, code: true, name: true } },
      address: ADDR,
      subscription: {
        select: {
          user: { select: { name: true, phone: true } }, address: ADDR, plan: { select: { name: true } },
          items: { select: { qty: true, variant: { select: { label: true, product: { select: { name: true } } } } } },
          order: { select: { id: true, status: true, invoice: { select: { number: true } } } },
        },
      },
      order: {
        select: {
          user: { select: { name: true, phone: true } }, status: true, invoice: { select: { number: true } },
          payment: { select: { method: true } }, items: { select: { productName: true, variantLabel: true, quantity: true } },
        },
      },
    },
  });

  const deliveries = rows.map((d) => {
    const isSub = !!d.subscription;
    const user = d.subscription?.user ?? d.order?.user ?? null;
    const addr = d.address ?? d.subscription?.address ?? null;
    const oid = d.orderId ?? d.subscription?.order?.id ?? null;
    const products = isSub
      ? (d.subscription?.items ?? []).map((i) => `${i.variant.product?.name ? i.variant.product.name + " " : ""}${i.variant.label} ×${i.qty}`.trim()).join(", ")
      : (d.order?.items ?? []).map((i) => `${i.productName}${i.variantLabel ? " " + i.variantLabel : ""} ×${i.quantity}`).join(", ");
    return {
      id: d.id,
      orderRef: oid ? "DOO-" + oid.slice(-6).toUpperCase() : "—",
      date: d.date, status: d.status, packingStatus: d.packingStatus, slot: d.slot ?? null, sequence: d.sequence,
      bottleCount: d.bottleCount, bottlesIn: d.bottlesIn, cashCollected: d.cashCollected, note: d.customerRemark ?? null,
      customer: user?.name ?? "—", mobile: user?.phone ?? "—",
      address: fmtAddr(addr), area: addr?.area ?? addr?.city ?? "—", pincode: addr?.pincode ?? null,
      lat: addr?.lat ?? null, lng: addr?.lng ?? null, deliveryNote: addr?.deliveryNote ?? null,
      driver: d.driver ? { id: d.driver.id, name: d.driver.user.name, employeeId: d.driver.employeeId } : null,
      route: d.route ? (d.route.code || d.route.name || null) : null,
      products: products || "—",
      type: isSub ? "Subscription" : "One-time",
      plan: d.subscription?.plan?.name ?? null,
      paymentStatus: d.order?.status ?? d.subscription?.order?.status ?? (isSub ? "SUBSCRIPTION" : "—"),
      paymentMethod: d.order?.payment?.method ?? null,
      invoiceNumber: d.order?.invoice?.number ?? d.subscription?.order?.invoice?.number ?? null,
    };
  });
  return ok({ deliveries, date: istDayWindow(dateStr).iso });
});
