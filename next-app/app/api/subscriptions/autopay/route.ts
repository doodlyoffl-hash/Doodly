/* /api/subscriptions/autopay — customer AutoPay (Razorpay recurring mandate).
   GET    ?subscriptionId= — this subscription's mandate status + history (own only)
   POST   { subscriptionId, planSlug, totalCount, amountPaise? } — enable → mandate
   PATCH  { subscriptionId | gatewaySubId, action: "pause"|"resume"|"retry" }
   DELETE ?id=<gatewaySubId>  — cancel the mandate
   Every route verifies the caller OWNS the subscription. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { enableAutopay, cancelAutopay, pauseAutopay, resumeAutopay, ownedMandate, customerAutopay } from "@/lib/autopay/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("autopay.status", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const subscriptionId = req.nextUrl.searchParams.get("subscriptionId");
  const all = await customerAutopay(userId);
  return ok({ autopay: subscriptionId ? all.find((a) => a.subscriptionId === subscriptionId) ?? null : all });
});

const Enable = z.object({ subscriptionId: z.string().min(1), planSlug: z.string().min(1), totalCount: z.number().int().positive().max(120), amountPaise: z.number().int().nonnegative().optional() });

export const POST = route("autopay.enable", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const b = await parseBody(req, Enable);
  try {
    const res = await enableAutopay({ userId, subscriptionId: b.subscriptionId, planSlug: b.planSlug, totalCount: b.totalCount, amountPaise: b.amountPaise ?? 0, ctx: reqContext(req) });
    return ok(res);
  } catch (e) {
    if ((e as { status?: number })?.status) throw e;   // ApiError (e.g. 404 not owned)
    const msg = (e as Error)?.message || "";
    if (/plan_id mapped/i.test(msg)) throw Errors.badRequest("AutoPay isn't available for this plan yet — please pay normally for now.");
    throw Errors.badRequest("Could not enable AutoPay. Please try again.");
  }
});

const Patch = z.object({ subscriptionId: z.string().optional(), gatewaySubId: z.string().optional(), action: z.enum(["pause", "resume", "retry"]) });

export const PATCH = route("autopay.control", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const b = await parseBody(req, Patch);
  if (!b.subscriptionId && !b.gatewaySubId) throw Errors.badRequest("subscriptionId or gatewaySubId required.");
  const ap = await ownedMandate(userId, { subscriptionId: b.subscriptionId, gatewaySubId: b.gatewaySubId });
  if (!ap) throw Errors.notFound("AutoPay mandate not found on your account.");
  const res = b.action === "pause" ? await pauseAutopay(ap, userId) : await resumeAutopay(ap, userId);
  return ok(res);
});

export const DELETE = route("autopay.cancel", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const gatewaySubId = req.nextUrl.searchParams.get("id");
  const subscriptionId = req.nextUrl.searchParams.get("subscriptionId") || undefined;
  const ap = await ownedMandate(userId, { gatewaySubId: gatewaySubId || undefined, subscriptionId });
  if (!ap) throw Errors.notFound("AutoPay mandate not found on your account.");
  return ok(await cancelAutopay(ap, userId));
});
