/* /api/wallet/recharge — wallet "Add Money".
   GET  → public recharge config { enabled, minPaise, maxPaise, presetsPaise }.
   POST → credit a top-up after a successful gateway payment (authenticated).
          Body: { amountPaise, reference?, method? }. Idempotent on `reference`
          (the gateway payment id) so a retried call never double-credits. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rechargeWallet, getRechargeConfig } from "@/lib/wallet/service";
import { currentUserId } from "@/lib/wallet/guard";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { readRole } from "@/lib/auth/identity";
import { razorpayConfigured } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEV = process.env.NODE_ENV !== "production";

export async function GET() {
  try {
    return NextResponse.json(await getRechargeConfig(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ enabled: true, minPaise: 10000, maxPaise: 10000000, presetsPaise: [10000, 25000, 50000, 100000, 200000, 500000] });
  }
}

const Body = z.object({
  amountPaise: z.number().int().positive(),
  reference: z.string().min(3).max(64).optional(),
  method: z.string().max(24).optional(),
});

export async function POST(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to add money to your wallet" }, { status: 401 });

  // With the real gateway configured, production credits happen ONLY via
  // /api/wallet/recharge/confirm (signature-verified). A client must never
  // be able to credit itself by claiming an unverified payment.
  if (!DEV && razorpayConfigured()) {
    return NextResponse.json({ error: "Recharges are processed through the payment gateway.", code: "use_gateway" }, { status: 409 });
  }

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  try {
    const result = await rechargeWallet({ userId, actorId: userId, actorRole: readRole(req), ...parsed.data });
    if (!("ok" in result) || !result.ok) return NextResponse.json({ error: "Recharge rejected", ...result }, { status: 409 });
    if (!result.idempotent) await audit({ userId, actorRole: readRole(req), action: "wallet.recharge", target: result.reference ?? null, ctx: reqContext(req) });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("wallet.recharge", (e as Error)?.message);
    return NextResponse.json({ error: "Could not complete recharge." }, { status: 500 });
  }
}
