/* /api/orders/[id] — one of the signed-in customer's own orders.
   GET                                   — full detail (items, timeline, delivery, payment, wallet, bottles)
   POST { action: "cancel"|"reorder"|"invoice"|"report"|"rate", ... } */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import {
  getCustomerOrderDetail, reorderCustomer, cancelCustomerOrder, reportOrderIssue, rateOrder, generateCustomerInvoice,
} from "@/lib/orders/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("orders.detail", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  const detail = await getCustomerOrderDetail(userId, params.id);
  if (!detail) throw Errors.notFound("Order not found.");
  return ok({ detail });
});

const actionSchema = z.object({
  action: z.enum(["cancel", "reorder", "invoice", "report", "rate"]),
  issue: z.string().trim().max(500).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(300).optional(),
});

export const POST = route("orders.action", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, actionSchema);
  const ctx = reqContext(req);
  try {
    switch (body.action) {
      case "cancel": {
        const r = await cancelCustomerOrder(userId, params.id);
        await audit({ userId, actorRole: "customer", action: "order.cancel", target: params.id, ctx });
        return ok(r);
      }
      case "reorder": {
        const r = await reorderCustomer(userId, params.id);
        await audit({ userId, actorRole: "customer", action: "order.reorder", target: params.id, ctx });
        return ok(r, { status: 201 });
      }
      case "invoice":
        return ok(await generateCustomerInvoice(userId, params.id));
      case "report":
        return ok(await reportOrderIssue(userId, params.id, body.issue ?? ""));
      case "rate":
        return ok(await rateOrder(userId, params.id, body.rating ?? 0, body.comment));
    }
  } catch (e) {
    throw Errors.badRequest((e as Error)?.message ?? "Action failed");
  }
});
