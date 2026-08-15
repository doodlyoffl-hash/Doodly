/* /api/admin/orders
   GET  — all orders for staff (orders:view). Optional filters: ?status= (PaymentStatus),
          ?type= (OrderType), ?q= (customer name/email/phone or order id suffix).
   POST — ASSISTED ORDER: authorised staff place a REAL order on a customer's behalf
          (assistedOrders:create). Drives the SAME placeOrder() engine as the storefront —
          identical pricing/deposit/serviceability/coupon/wallet/subscription/payment/
          invoice/delivery/audit — tagged source="assisted" with the staff actor + consent. */
import { NextRequest } from "next/server";
import { z } from "zod";
import type { OrderType, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requirePermission, requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { placeOrder, type CheckoutInput } from "@/lib/checkout/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"];
const TYPES = ["SUBSCRIPTION", "ONE_TIME", "EXTRA", "SAMPLE"];

export const GET = route("admin.orders.list", async (req: NextRequest) => {
  requirePermission(req, "orders", "view");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const source = url.searchParams.get("source");
  const q = url.searchParams.get("q")?.trim();

  const orders = await db.order.findMany({
    where: {
      ...(status && STATUSES.includes(status) ? { status: status as PaymentStatus } : {}),
      ...(type && TYPES.includes(type) ? { type: type as OrderType } : {}),
      ...(source && ["website", "assisted", "simple_mode"].includes(source) ? { source } : {}),
      ...(q
        ? { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, type: true, status: true, createdAt: true, totalPaise: true, discountPaise: true,
      source: true, placedByRole: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      delivery: { select: { status: true, date: true } },
      // The subscription a SAMPLE/SUBSCRIPTION order created — its lifecycle status is the
      // real fulfilment state (a finished trial is COMPLETED even though the order is PAID).
      subscription: { select: { status: true } },
      invoice: { select: { number: true } },
    },
  });
  return ok({ orders });
});

/* ---- Assisted order (staff places it for a customer) ---- */
const AssistedBody = z.object({
  customerId: z.string().min(1).max(40),
  consent: z.literal(true),                                  // staff attests the customer consented (Part 5)
  variantId: z.string().min(1).max(30),
  planId: z.string().min(1).max(30).optional(),
  bottles: z.number().int().min(1).max(20).optional(),
  extraBottles: z.number().int().min(0).max(20).optional(),
  unavailableBottles: z.number().int().min(0).max(20).optional(),
  unavailableReason: z.enum(["lost", "broken", "kept", "other"]).optional(),
  couponCode: z.string().trim().max(40).optional(),
  walletAmountPaise: z.number().int().min(0).max(100_000_000).optional(),
  startDate: z.string().max(40).optional(),
  slot: z.string().max(40).optional(),
  address: z.object({ id: z.string().min(1).max(40) }),      // must be an existing SAVED address of this customer
  // NB: no `method` — assisted orders settle by wallet (if it covers) or a Razorpay Payment Link (AO3),
  //     never an interactive gateway popup or COD. Payment is never marked paid until genuinely confirmed.
});

export const POST = route("admin.orders.assisted", async (req: NextRequest) => {
  const role = requirePermission(req, "assistedOrders", "create");
  const staffId = requireUserId(req);
  const rl = rateLimit(`assisted:${staffId}`, 12, 60_000);
  if (!rl.ok) throw Errors.tooMany();
  const { customerId, consent: _consent, ...checkout } = await parseBody(req, AssistedBody);

  const customer = await db.user.findUnique({ where: { id: customerId }, select: { id: true, role: true } });
  if (!customer) throw Errors.badRequest("Customer not found — search for or create the customer first.");
  if (customer.role !== "CUSTOMER") throw Errors.badRequest("Assisted orders can only be placed for customer accounts.");

  // Same production engine as the website — tagged assisted, with the staff actor + consent.
  const result = await placeOrder(customerId, checkout as CheckoutInput, reqContext(req), {
    source: "assisted", actorId: staffId, actorRole: role, consentAt: new Date(),
  });
  return ok(result);
});
