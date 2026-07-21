/* /api/admin/milk/settle — draw a day's sold litres from FIFO inventory.
   POST { date? } (procurement:edit). Idempotent per day. Returns the day's
   consumption + COGS + any shortfall (oversold vs stock). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { settleDay } from "@/lib/milk/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const POST = route("admin.milk.settle", async (req: NextRequest) => {
  const role = requirePermission(req, "procurement", "edit");
  const body = await parseBody(req, bodySchema);
  const settlement = await settleDay(body.date ?? new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10), { actorId: readUserId(req) ?? undefined, actorRole: role });
  return ok(settlement);
});
