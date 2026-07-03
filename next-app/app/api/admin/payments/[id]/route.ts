/* /api/admin/payments/[id] — one payment, admin view.
   GET   — full detail (payments:view).
   PATCH — action dispatch: refund (payments:refund) | retry | reconcile |
           note | receipt (payments:edit). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/payments/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { getPaymentDetail, processRefund, retryPayment, reconcilePayment, addNote, sendReceipt, type Actor } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.payments.detail", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "payments", "view");
  const detail = await getPaymentDetail(params.id);
  if (!detail) throw Errors.notFound("Payment not found.");
  return ok({ payment: detail });
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refund"), amountPaise: z.number().int().min(1).max(100_000_00), reason: z.string().max(300).optional(), toWallet: z.boolean().optional() }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("reconcile") }),
  z.object({ action: z.literal("note"), text: z.string().min(1).max(500) }),
  z.object({ action: z.literal("receipt") }),
]);

export const PATCH = route("admin.payments.action", async (req: NextRequest, { params }: Ctx) => {
  // refund requires the payments:refund special; the rest require payments:edit.
  const peek = await req.clone().json().catch(() => ({}));
  const role = requirePermission(req, "payments", peek?.action === "refund" ? "refund" : "edit");
  const body = await parseBody(req, patchSchema);
  const id = params.id;
  const actor: Actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) };

  let result: unknown;
  switch (body.action) {
    case "refund": result = await processRefund(id, { amountPaise: body.amountPaise, reason: body.reason, toWallet: body.toWallet }, actor); break;
    case "retry": result = await retryPayment(id, actor); break;
    case "reconcile": result = await reconcilePayment(id, actor); break;
    case "note": result = await addNote(id, body.text, actor); break;
    case "receipt": result = await sendReceipt(id, actor); break;
  }

  await audit({ actorRole: role, action: `payment.${body.action}`, target: id, ctx: reqContext(req) });
  return ok({ result });
});
