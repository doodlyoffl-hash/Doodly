/* GET /api/orders — the signed-in customer's orders (own only) with search,
   filters (payment status, type, date range, cancelled), sort and pagination. */
import { NextRequest } from "next/server";
import type { PaymentStatus, OrderType } from "@prisma/client";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { listCustomerOrders, type SortKey } from "@/lib/orders/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYMENTS = ["PENDING", "PAID", "FAILED", "REFUNDED"];
const TYPES = ["SUBSCRIPTION", "ONE_TIME", "EXTRA", "SAMPLE"];

export const GET = route("orders.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const sp = new URL(req.url).searchParams;
  const payment = sp.get("paymentStatus");
  const type = sp.get("type");
  const cancelledParam = sp.get("cancelled");
  const result = await listCustomerOrders(userId, {
    paymentStatus: payment && PAYMENTS.includes(payment) ? (payment as PaymentStatus) : undefined,
    type: type && TYPES.includes(type) ? (type as OrderType) : undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    q: sp.get("q") ?? undefined,
    cancelled: cancelledParam === "1" ? true : cancelledParam === "0" ? false : undefined,
    sort: (sp.get("sort") as SortKey) ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  });
  return ok(result);
});
