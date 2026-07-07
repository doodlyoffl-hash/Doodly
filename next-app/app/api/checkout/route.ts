/* POST /api/checkout — place a real order from the storefront.
   Authenticated; the price is computed server-side from the catalogue
   (the client never sends an amount). Payment: "wallet" debits the
   DOODLY wallet idempotently, "cod" records pay-on-delivery, and
   upi/card/netbanking return a Razorpay order for the Checkout popup
   (completed by the existing /api/payments/verify + webhook). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { rateLimit } from "@/lib/auth/ratelimit";
import { placeOrder } from "@/lib/checkout/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  variantId: z.string().min(1).max(30),
  planId: z.string().min(1).max(30).optional(),
  bottles: z.number().int().min(1).max(20).optional(),
  method: z.enum(["upi", "card", "netbanking", "wallet"]),   // prepaid only — no COD
  couponCode: z.string().trim().max(40).optional(),          // validated + applied server-side
  walletAmountPaise: z.number().int().min(0).max(100_000_000).optional(), // capped server-side
  startDate: z.string().max(40).optional(),
  slot: z.string().max(40).optional(),
  address: z.object({
    id: z.string().max(40).optional(),
    label: z.string().max(30).optional(),
    line1: z.string().max(200).optional(),
    city: z.string().max(60).optional(),
    pincode: z.string().max(10).optional(),
    contactName: z.string().max(80).optional(),
    phone: z.string().max(20).optional(),
  }),
});

export const POST = route("checkout.place", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const rl = rateLimit(`checkout:${userId}`, 6, 60_000);
  if (!rl.ok) throw Errors.tooMany();
  const body = await parseBody(req, Body);
  return ok(await placeOrder(userId, body, reqContext(req)));
});
