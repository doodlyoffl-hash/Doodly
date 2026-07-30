/* POST /api/admin/bottle-pickups/[id] — operations act on a bottle-return pickup:
   schedule (date/slot/exec) · assign (exec) · verify · refund · cancel · adjust.
   RBAC bottleInventory:adjust. Every action is audited inside the service. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId, readRole } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { schedulePickup, verifyPickup, refundPickup, cancelPickup } from "@/lib/bottles/pickup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const Body = z.object({
  action: z.enum(["schedule", "assign", "verify", "refund", "cancel"]),
  date: z.string().optional(),        // YYYY-MM-DD (schedule)
  slot: z.string().trim().max(40).optional(),
  driverId: z.string().min(1).optional(),
});

export const POST = route("admin.bottlePickup.action", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "bottleInventory", "adjust");
  const body = await parseBody(req, Body);
  const actor = { userId: readUserId(req), role: readRole(req) as string, ctx: reqContext(req) };

  switch (body.action) {
    case "schedule":
    case "assign":
      return ok(await schedulePickup(params.id, { date: body.date ?? null, slot: body.slot ?? null, driverId: body.driverId ?? null, actor }));
    case "verify":
      return ok(await verifyPickup(params.id, actor));
    case "refund":
      return ok(await refundPickup(params.id, actor));
    case "cancel":
      return ok(await cancelPickup(params.id, actor));
    default:
      throw Errors.badRequest("Unknown action.");
  }
});
