/* GET /api/bottles — the signed-in customer's glass-bottle ledger and the
   derived totals. Pending = ISSUED − RETURNED − LOST. */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("bottles.list", async (req: NextRequest) => {
  const userId = requireUserId(req);

  const [ledger, groups, deposit] = await Promise.all([
    db.bottleLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: { id: true, event: true, qty: true, amountPaise: true, note: true, createdAt: true, delivery: { select: { date: true } } },
    }),
    db.bottleLedger.groupBy({ by: ["event"], where: { userId }, _sum: { qty: true, amountPaise: true } }),
    db.bottleLedger.aggregate({ where: { userId, event: "DEPOSIT_CHARGED" }, _sum: { amountPaise: true } }),
  ]);

  const qty = (e: string) => groups.find((g) => g.event === e)?._sum.qty ?? 0;
  const issued = qty("ISSUED"), returned = qty("RETURNED"), lost = qty("LOST");

  return ok({
    ledger,
    summary: {
      issued, returned, lost,
      pending: Math.max(0, issued - returned - lost),
      depositPaise: deposit._sum.amountPaise ?? 0,
    },
  });
});
