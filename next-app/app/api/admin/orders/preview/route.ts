/* POST /api/admin/orders/preview — DRY-RUN quote for the assisted-order builder
   (assistedOrders:create). Computes pricing + bottle deposit + coupon + wallet +
   serviceability using the SAME functions placeOrder() uses, but writes NOTHING.
   Powers the live summary panel + the confirm screen. `customerId` optional — a
   not-yet-created customer previews as a new customer (owned 0, ₹0 wallet). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { previewCheckout, type PreviewInput } from "@/lib/checkout/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  customerId: z.string().min(1).max(40).optional(),
  variantId: z.string().min(1).max(30),
  planId: z.string().min(1).max(30).optional(),
  bottles: z.number().int().min(1).max(20).optional(),
  extraBottles: z.number().int().min(0).max(20).optional(),
  unavailableBottles: z.number().int().min(0).max(20).optional(),
  unavailableReason: z.enum(["lost", "broken", "kept", "other"]).optional(),
  couponCode: z.string().trim().max(40).optional(),
  walletAmountPaise: z.number().int().min(0).max(100_000_000).optional(),
  addressId: z.string().min(1).max(40).optional(),
});

export const POST = route("admin.orders.preview", async (req: NextRequest) => {
  requirePermission(req, "assistedOrders", "create");
  const { customerId, ...input } = await parseBody(req, Body);
  const preview = await previewCheckout(customerId ?? null, input as PreviewInput);
  return ok({ preview });
});
