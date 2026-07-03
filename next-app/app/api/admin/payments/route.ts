/* /api/admin/payments — unified payments ledger list + manual recording.
   GET  — filter / sort / paginate (payments:view → Admin, Super-Admin, Accountant).
   POST — record a manual payment (payments:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/payments/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { listPayments, recordManualPayment, type ListArgs } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.payments.list", async (req: NextRequest) => {
  requirePermission(req, "payments", "view");
  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  const args: ListArgs = {
    status: p.get("status") || undefined,
    method: p.get("method") || undefined,
    gateway: p.get("gateway") || undefined,
    source: p.get("source") || undefined,
    walletUsed: p.get("walletUsed") || undefined,
    autopay: p.get("autopay") || undefined,
    dateFrom: p.get("from") || undefined,
    dateTo: p.get("to") || undefined,
    amountMin: num("amountMin"),
    amountMax: num("amountMax"),
    customerId: p.get("customerId") || undefined,
    q: p.get("q") || undefined,
    sort: p.get("sort") || undefined,
    dir: (p.get("dir") as "asc" | "desc") || undefined,
    page: num("page"),
    pageSize: num("pageSize"),
  };
  return ok(await listPayments(args));
});

const recordSchema = z.object({
  userId: z.string().min(1),
  amountPaise: z.number().int().min(1).max(100_000_00),
  method: z.enum(["UPI", "CARD", "NETBANKING", "WALLET", "CASH"]),
  gateway: z.string().max(30).optional(),
  orderId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  billingId: z.string().min(1).optional(),
  walletUsedPaise: z.number().int().min(0).optional(),
  gstPaise: z.number().int().min(0).optional(),
  discountPaise: z.number().int().min(0).optional(),
  reference: z.string().max(80).optional(),
  invoiceNumber: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
  markPaid: z.boolean().optional(),
});

export const POST = route("admin.payments.record", async (req: NextRequest) => {
  const role = requirePermission(req, "payments", "create");
  const body = await parseBody(req, recordSchema);
  const res = await recordManualPayment(body, { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) });
  await audit({ actorRole: role, action: "payment.record", target: res.id, ctx: reqContext(req) });
  return ok({ payment: res }, { status: 201 });
});
