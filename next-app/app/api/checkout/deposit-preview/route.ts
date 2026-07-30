/* GET /api/checkout/deposit-preview?bottles=N&extra=M — the smart bottle-deposit the
   customer will be charged for a plan needing N bottles/delivery, given the bottles they
   already own. Optional-auth: anonymous = a new customer (owned 0 → mandatory deposit).
   Powers the checkout "Bottle Ownership" section so the displayed deposit == the charge. */
import { NextRequest } from "next/server";
import { ok, route } from "@/lib/http";
import { readUserId } from "@/lib/auth/identity";
import { bottleOwnership, depositForCheckout } from "@/lib/bottles/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("checkout.depositPreview", async (req: NextRequest) => {
  const userId = readUserId(req);
  const sp = new URL(req.url).searchParams;
  const bottles = Math.min(20, Math.max(1, Number(sp.get("bottles")) || 1));
  const extra = Math.min(20, Math.max(0, Number(sp.get("extra")) || 0));

  const [ownership, deposit] = await Promise.all([
    userId ? bottleOwnership(userId) : Promise.resolve(null),
    depositForCheckout({ userId, requiredBottles: bottles, extraBottles: extra }),
  ]);
  return ok({ signedIn: !!userId, ownership, deposit });
});
