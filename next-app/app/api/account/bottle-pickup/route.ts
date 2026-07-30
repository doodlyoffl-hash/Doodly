/* Customer bottle-return + deposit-refund.
   GET  → the customer's deposit summary + their pickup requests (Bottle Deposit dashboard).
   POST → raise a final bottle-return pickup request (only when they still hold bottles). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { customerHeld } from "@/lib/bottles/balance";
import { depositHeldPaise, depositPerBottlePaise } from "@/lib/bottles/deposit";
import { createPickupRequest } from "@/lib/bottles/pickup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  addressId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  preferredDate: z.string().datetime().optional(),
  preferredSlot: z.string().trim().max(40).optional(),
  note: z.string().trim().max(400).optional(),
});

export const GET = route("account.bottlePickup.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const [{ held, heldSince, overdueDays }, heldPaise, perBottle, refundedAgg, requests] = await Promise.all([
    customerHeld(userId),
    depositHeldPaise(userId),
    depositPerBottlePaise(),
    db.bottleLedger.aggregate({ where: { userId, event: "DEPOSIT_REFUNDED" }, _sum: { amountPaise: true } }),
    db.bottlePickupRequest.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 20, select: { id: true, status: true, bottlesExpected: true, bottlesCollected: true, refundableDepositPaise: true, refundedPaise: true, preferredDate: true, preferredSlot: true, requestedAt: true, collectedAt: true, refundedAt: true } }),
  ]);
  const chargedAgg = await db.order.aggregate({ where: { userId, status: "PAID" }, _sum: { depositPaise: true } });
  const active = requests.find((r) => !["REFUNDED", "CLOSED", "CANCELLED"].includes(r.status)) ?? null;
  return ok({
    deposit: {
      perBottlePaise: perBottle,
      paidPaise: chargedAgg._sum.depositPaise ?? 0,
      refundedPaise: refundedAgg._sum.amountPaise ?? 0,
      heldPaise,
      outstandingBottles: held,
      heldSince: heldSince ? heldSince.toISOString() : null,
      overdueDays,
    },
    canRequest: held > 0 && !active,
    activeRequestId: active?.id ?? null,
    requests: requests.map((r) => ({ ...r, preferredDate: r.preferredDate?.toISOString() ?? null, requestedAt: r.requestedAt.toISOString(), collectedAt: r.collectedAt?.toISOString() ?? null, refundedAt: r.refundedAt?.toISOString() ?? null })),
  });
});

export const POST = route("account.bottlePickup.create", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, Body);
  const created = await createPickupRequest({
    userId,
    addressId: body.addressId ?? null,
    subscriptionId: body.subscriptionId ?? null,
    preferredDate: body.preferredDate ? new Date(body.preferredDate) : null,
    preferredSlot: body.preferredSlot ?? null,
    note: body.note ?? null,
    ctx: reqContext(req),
  });
  return ok(created);
});
