/* GET /api/driver/summary — today's KPIs for the signed-in delivery executive. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { heldByUsers } from "@/lib/bottles/balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("driver.summary", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const driver = await db.driver.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
  if (!driver) throw Errors.forbidden("No delivery profile is linked to this account.");

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);

  const today = await db.delivery.findMany({
    where: { driverId: driver.id, date: { gte: start, lte: end } },
    select: { status: true, cashCollected: true, bottlesIn: true, bottleCount: true, subscription: { select: { userId: true } }, order: { select: { userId: true } } },
  });

  const delivered = today.filter((d) => d.status === "DELIVERED");
  const pending = today.filter((d) => !["DELIVERED", "FAILED", "SKIPPED"].includes(d.status));

  // Bottles to collect = the outstanding empties each pending customer still holds (not today's count).
  const held = await heldByUsers(pending.map((d) => d.subscription?.userId ?? d.order?.userId).filter(Boolean) as string[]);
  const bottlesToCollect = pending.reduce((s, d) => { const uid = d.subscription?.userId ?? d.order?.userId; return s + (uid ? (held.get(uid) ?? 0) : 0); }, 0);

  return ok({
    summary: {
      name: driver.user.name,
      employeeId: driver.employeeId,
      stopsToday: today.length,
      deliveredToday: delivered.length,
      pendingToday: pending.length,
      cashCollectedPaise: today.reduce((s, d) => s + d.cashCollected, 0),
      bottlesToCollect,
      bottlesCollectedToday: delivered.reduce((s, d) => s + d.bottlesIn, 0),
    },
  });
});
