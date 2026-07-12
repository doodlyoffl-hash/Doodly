/* /api/admin/autopay — AutoPay monitoring + management (billing RBAC).
   GET  ?status=&q= — KPIs + mandate list. POST { action, gatewaySubId } —
   retry(=resume) | suspend(=pause) | resume | cancel. All audited. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { adminAutopayList, adminAutopayStats, cancelAutopay, pauseAutopay, resumeAutopay } from "@/lib/autopay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.autopay.list", async (req: NextRequest) => {
  requirePermission(req, "billing", "view");
  const sp = req.nextUrl.searchParams;
  const [stats, mandates] = await Promise.all([adminAutopayStats(), adminAutopayList({ status: sp.get("status") || undefined, q: sp.get("q") || undefined })]);
  return ok({ stats, mandates });
});

const Body = z.object({ action: z.enum(["retry", "resume", "suspend", "cancel"]), gatewaySubId: z.string().min(1) });

export const POST = route("admin.autopay.action", async (req: NextRequest) => {
  const role = requirePermission(req, "billing", "edit");
  const { action, gatewaySubId } = await parseBody(req, Body);
  const ap = await db.autopaySubscription.findFirst({ where: { gatewaySubId }, include: { subscription: { select: { userId: true } } } });
  if (!ap) throw Errors.notFound("Mandate not found.");
  const uid = ap.subscription?.userId ?? "";
  const res =
    action === "cancel" ? await cancelAutopay(ap, uid)
    : action === "suspend" ? await pauseAutopay(ap, uid)
    : await resumeAutopay(ap, uid, role);   // retry + resume both re-attempt via Razorpay
  await audit({ actorRole: role, action: `admin.autopay.${action}`, target: gatewaySubId, ctx: reqContext(req) });
  return ok(res);
});
