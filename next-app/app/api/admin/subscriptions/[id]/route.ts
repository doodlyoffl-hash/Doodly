/* /api/admin/subscriptions/[id] — one subscription, admin view.
   GET   — full detail (customer, items, schedule, wallet, timeline…).
   PATCH — action dispatch: update | pause | resume | skip | cancel | autopay | note.
   Admin + Super-Admin ONLY. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireSubsAdmin, actorId } from "@/lib/subscriptions/guard";
import { reqIp } from "@/lib/subscriptions/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import {
  getSubscriptionDetail, updateSubscription, pauseSubscription, resumeSubscription,
  skipDelivery, cancelSubscription, setAutopay, addNote,
  cancelDates, adjustDelivery, reinstate, extend, computeRemainingValue, refundSubscription,
  changeFrequency, changeQuantity, changeProduct, previewSubscriptionChange, type Actor,
} from "@/lib/subscriptions/admin";
import { ADJUST_REASONS } from "@/lib/subscriptions/reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.subscriptions.detail", async (req: NextRequest, { params }: Ctx) => {
  requireSubsAdmin(req);
  const detail = await getSubscriptionDetail(params.id);
  if (!detail) throw Errors.notFound("Subscription not found.");
  // Suggested prorated refund for the cancel dialog (admin edits the amount/method).
  const refundQuote = await computeRemainingValue(params.id).catch(() => null);
  return ok({ subscription: detail, refundQuote });
});

const itemSchema = z.object({ variantId: z.string().min(1), qty: z.number().int().min(1).max(20) });
const refundSchema = z.object({ method: z.enum(["wallet", "gateway", "none", "manual"]), amountPaise: z.number().int().min(0).max(50_000_00).optional(), note: z.string().max(300).optional() });

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    planId: z.string().min(1).optional(),
    addressId: z.string().min(1).optional(),
    deliverySlot: z.string().min(1).optional(),
    autoRenew: z.boolean().optional(),
    startDate: z.string().datetime().optional(),
    items: z.array(itemSchema).min(1).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("pause"), until: z.string().datetime().optional(), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("skip"), date: z.string().datetime().optional() }),
  z.object({ action: z.literal("cancel-dates"), dates: z.array(z.string().datetime()).min(1).max(60) }),
  z.object({ action: z.literal("adjust"), deliveryId: z.string().min(1), reason: z.enum(ADJUST_REASONS), note: z.string().max(300).optional() }),
  z.object({ action: z.literal("reinstate"), deliveryId: z.string().min(1) }),
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(120), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("change-frequency"), cadence: z.number().int().min(1).max(7) }),
  z.object({ action: z.literal("change-quantity"), qty: z.number().int().min(1).max(50) }),
  z.object({ action: z.literal("change-product"), variantId: z.string().min(1) }),
  z.object({ action: z.literal("preview-change"), cadence: z.number().int().min(1).max(7).optional(), quantity: z.number().int().min(1).max(50).optional(), variantId: z.string().min(1).optional() }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(300).optional(), scope: z.enum(["all", "remaining"]).optional(), refund: refundSchema.optional() }),
  z.object({ action: z.literal("refund"), refund: refundSchema }),
  z.object({ action: z.literal("autopay"), on: z.boolean() }),
  z.object({ action: z.literal("note"), text: z.string().min(1).max(500) }),
]);

export const PATCH = route("admin.subscriptions.action", async (req: NextRequest, { params }: Ctx) => {
  const role = requireSubsAdmin(req);
  const body = await parseBody(req, patchSchema);
  const id = params.id;
  const actor: Actor = { actorId: actorId(req), actorRole: role, ip: reqIp(req) };

  let result: unknown;
  switch (body.action) {
    case "update": result = await updateSubscription(id, body, actor); break;
    case "pause": result = await pauseSubscription(id, { until: body.until, reason: body.reason }, actor); break;
    case "resume": result = await resumeSubscription(id, actor); break;
    case "skip": result = await skipDelivery(id, body.date, actor); break;
    case "cancel-dates": result = await cancelDates(id, body.dates, actor); break;
    case "adjust": result = await adjustDelivery(body.deliveryId, body.reason, body.note, actor); break;
    case "reinstate": result = await reinstate(body.deliveryId, actor); break;
    case "extend": result = await extend(id, body.days, body.reason, actor); break;
    case "change-frequency": result = await changeFrequency(id, body.cadence, actor); break;
    case "change-quantity": result = await changeQuantity(id, body.qty, actor); break;
    case "change-product": result = await changeProduct(id, body.variantId, actor); break;
    case "preview-change": result = await previewSubscriptionChange(id, { cadence: body.cadence, quantity: body.quantity, variantId: body.variantId }); break;
    case "cancel": result = await cancelSubscription(id, { reason: body.reason, scope: body.scope, refund: body.refund }, actor); break;
    case "refund": result = await refundSubscription(id, body.refund, actor); break;
    case "autopay": result = await setAutopay(id, body.on, actor); break;
    case "note": result = await addNote(id, body.text, actor); break;
  }

  await audit({ actorRole: role, action: `subscription.${body.action}`, target: id, ctx: reqContext(req) });
  return ok({ result });
});
