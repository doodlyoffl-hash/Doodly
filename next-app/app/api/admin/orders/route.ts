/* GET /api/admin/orders — all orders for staff (orders:view).
   Optional filters: ?status= (PaymentStatus), ?type= (OrderType), ?q= (customer
   name/email/phone or order id suffix). */
import { NextRequest } from "next/server";
import type { OrderType, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"];
const TYPES = ["SUBSCRIPTION", "ONE_TIME", "EXTRA", "SAMPLE"];

export const GET = route("admin.orders.list", async (req: NextRequest) => {
  requirePermission(req, "orders", "view");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q")?.trim();

  const orders = await db.order.findMany({
    where: {
      ...(status && STATUSES.includes(status) ? { status: status as PaymentStatus } : {}),
      ...(type && TYPES.includes(type) ? { type: type as OrderType } : {}),
      ...(q
        ? { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, type: true, status: true, createdAt: true, totalPaise: true, discountPaise: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      delivery: { select: { status: true, date: true } },
      invoice: { select: { number: true } },
    },
  });
  return ok({ orders });
});
