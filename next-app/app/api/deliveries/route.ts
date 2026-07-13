/* GET /api/deliveries — the signed-in customer's deliveries (via their
   subscriptions or one-off orders). Used by Deliveries, Tracking and the
   Calendar. Returns newest-first; the client splits upcoming vs past.
   Scoped strictly to the authenticated user (subscription.userId OR
   order.userId) — a customer can never see another customer's deliveries. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (id: string) => `DOO-${id.slice(-6).toUpperCase()}`;
type Addr = { houseNo: string | null; buildingName: string | null; area: string | null; line1: string; city: string; pincode: string };
const fmtAddr = (a: Addr | null | undefined) =>
  a ? [a.houseNo, a.buildingName, a.area || a.line1, a.city].filter(Boolean).join(", ") + (a.pincode ? " " + a.pincode : "") : null;

export const GET = route("deliveries.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const rows = await db.delivery.findMany({
    where: { OR: [{ subscription: { userId } }, { order: { userId } }] },
    orderBy: { date: "desc" },
    take: 180,
    select: {
      id: true, date: true, status: true, slot: true, sequence: true,
      deliveredAt: true, bottlesOut: true, bottlesIn: true, bottleCount: true, customerRemark: true,
      // Delivery-level address snapshot (pinned at completion / on an address change);
      // preferred over the live subscription address so history stays accurate.
      address: { select: { houseNo: true, buildingName: true, area: true, line1: true, city: true, pincode: true } },
      driver: { select: { user: { select: { name: true } } } },
      order: { select: { id: true, items: { select: { productName: true, variantLabel: true, quantity: true } } } },
      subscription: {
        select: {
          deliverySlot: true,
          plan: { select: { name: true } },
          address: { select: { houseNo: true, buildingName: true, area: true, line1: true, city: true, pincode: true } },
          items: { select: { qty: true, variant: { select: { displayName: true, label: true, product: { select: { name: true } } } } } },
        },
      },
    },
  });

  const deliveries = rows.map(({ driver, order, subscription, ...d }) => {
    const items = order?.items?.length
      ? order.items.map((i) => `${i.productName}${i.variantLabel ? " " + i.variantLabel : ""}${i.quantity > 1 ? " ×" + i.quantity : ""}`)
      : subscription?.items?.length
        ? subscription.items.map((i) => `${i.variant.product?.name ? i.variant.product.name + " " : ""}${i.variant.displayName || i.variant.label}${i.qty > 1 ? " ×" + i.qty : ""}`.trim())
        : [];
    return {
      id: d.id, date: d.date, status: d.status, sequence: d.sequence,
      slot: d.slot || subscription?.deliverySlot || null,
      deliveredAt: d.deliveredAt, customerRemark: d.customerRemark,
      bottlesOut: d.bottlesOut, bottlesIn: d.bottlesIn, bottleCount: d.bottleCount,
      driver: driver ? { name: driver.user.name } : null,
      orderRef: order ? num(order.id) : null,
      planName: subscription?.plan?.name || null,
      itemsSummary: items.join(", ") || null,
      address: fmtAddr(d.address ?? subscription?.address),
    };
  });
  return ok({ deliveries });
});
