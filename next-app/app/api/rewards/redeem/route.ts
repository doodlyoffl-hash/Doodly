/* POST /api/rewards/redeem — claim a reward (single-use). Requires a signed-in
   customer. Body: exactly one of {code|token} + exactly one of {addressId|newAddress}.
   Delegates to redeemReward → serviceable-address gate → ₹0 p7 subscription + 7
   deliveries. Errors: 401 not signed in · 403 bound to another account · 404 unknown
   reward/address/plan/variant · 409 already claimed/race · 400 not serviceable/expired. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { addressFields } from "@/lib/addresses/helpers";
import { redeemReward } from "@/lib/rewards/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NewAddress = z.object(addressFields).extend({
  pincode: z.string().transform((s) => s.replace(/\D/g, "").slice(0, 6)).refine((v) => /^[1-9]\d{5}$/.test(v), "Enter a valid 6-digit pincode"),
});
const Body = z
  .object({
    code: z.string().max(40).optional(),
    token: z.string().max(200).optional(),
    addressId: z.string().min(5).max(60).optional(),
    newAddress: NewAddress.optional(),
  })
  .refine((b) => !!b.code !== !!b.token, "Provide exactly one of code or token")
  .refine((b) => !!b.addressId !== !!b.newAddress, "Provide exactly one of addressId or newAddress");

export const POST = route("rewards.redeem", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, Body);
  const res = await redeemReward({
    code: body.code, token: body.token, userId,
    addressId: body.addressId, newAddress: body.newAddress as Record<string, unknown> | undefined,
    ctx: reqContext(req),
  });
  return ok({ subscriptionId: res.subscriptionId, code: res.reward.code, status: "REDEEMED" });
});
