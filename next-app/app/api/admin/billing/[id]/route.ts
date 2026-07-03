/* /api/admin/billing/[id] — one billing record. Admin + Super-Admin ONLY.
   GET   — full detail (breakdown, wallet, attempts, renewals, audit).
   PATCH — action dispatch: pay | retry | autopay | method | renew | invoice | cancel | note. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireBillingAdmin, actorId } from "@/lib/billing/guard";
import { reqIp } from "@/lib/billing/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import {
  getBillingDetail, recordManualPayment, processAutopay, changePaymentMethod,
  renewBilling, generateInvoice, cancelBilling, addNote, type Actor,
} from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.billing.detail", async (req: NextRequest, { params }: Ctx) => {
  requireBillingAdmin(req);
  const detail = await getBillingDetail(params.id);
  if (!detail) throw Errors.notFound("Billing record not found.");
  return ok({ billing: detail });
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay"), method: z.enum(["UPI", "CARD", "NETBANKING", "WALLET", "CASH"]), amountPaise: z.number().int().min(1).max(100_000_00) }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("autopay") }),
  z.object({ action: z.literal("method"), type: z.string().min(2).max(40), label: z.string().max(60).optional() }),
  z.object({ action: z.literal("renew") }),
  z.object({ action: z.literal("invoice") }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(300).optional(), refund: z.boolean().optional() }),
  z.object({ action: z.literal("note"), text: z.string().min(1).max(500) }),
]);

export const PATCH = route("admin.billing.action", async (req: NextRequest, { params }: Ctx) => {
  const role = requireBillingAdmin(req);
  const body = await parseBody(req, patchSchema);
  const id = params.id;
  const actor: Actor = { actorId: actorId(req), actorRole: role, ip: reqIp(req) };

  let result: unknown;
  switch (body.action) {
    case "pay": result = await recordManualPayment(id, { method: body.method, amountPaise: body.amountPaise }, actor); break;
    case "retry": result = await processAutopay(id, actor, true); break;
    case "autopay": result = await processAutopay(id, actor, false); break;
    case "method": result = await changePaymentMethod(id, { type: body.type, label: body.label }, actor); break;
    case "renew": result = await renewBilling(id, actor); break;
    case "invoice": result = await generateInvoice(id, actor); break;
    case "cancel": result = await cancelBilling(id, { reason: body.reason, refund: body.refund }, actor); break;
    case "note": result = await addNote(id, body.text, actor); break;
  }

  await audit({ actorRole: role, action: `billing.${body.action}`, target: id, ctx: reqContext(req) });
  return ok({ result });
});
