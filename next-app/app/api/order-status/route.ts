/* /api/order-status — the customer's live order/delivery status for the banner.
   Polled by <LiveOrderBanner/>. Returns { active:false } for logged-out users or
   when nothing is in flight (banner hides). Never throws — failure → inactive. */
import { NextRequest, NextResponse } from "next/server";
import { getLiveStatus } from "@/lib/order-status/service";
import { currentUserId } from "@/lib/order-status/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await getLiveStatus(currentUserId(req));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
