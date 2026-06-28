/* POST /api/wallet/apply — preview how much wallet balance applies to an order.
   Body: { orderTotalPaise, requestedPaise? }. Read-only (no mutation); the actual
   debit happens server-side at order placement. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewWalletApply } from "@/lib/wallet/service";
import { currentUserId } from "@/lib/wallet/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  orderTotalPaise: z.number().int().nonnegative(),
  requestedPaise: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to use your wallet" }, { status: 401 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  try {
    const result = await previewWalletApply({ userId, ...parsed.data });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("wallet.apply", (e as Error)?.message);
    return NextResponse.json({ error: "Could not compute wallet usage." }, { status: 500 });
  }
}
