/* GET /api/wallet — the signed-in customer's wallet (balance + transactions + summary). */
import { NextRequest, NextResponse } from "next/server";
import { getWallet } from "@/lib/wallet/service";
import { currentUserId } from "@/lib/wallet/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = currentUserId(req);
  if (!userId) return NextResponse.json({ error: "Sign in to view your wallet" }, { status: 401 });
  try {
    const wallet = await getWallet({ userId });
    return NextResponse.json(wallet, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("wallet.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load your wallet." }, { status: 500 });
  }
}
