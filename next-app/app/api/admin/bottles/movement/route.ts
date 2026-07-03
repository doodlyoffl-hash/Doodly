/* POST /api/admin/bottles/movement — record a fleet lifecycle transition
   (assign / return / clean / damage / lose / add stock). Requires a reason,
   can't drive any stage negative, appends a BottleMovement + central AuditLog.
   RBAC: bottleInventory:adjust (a FULL-level special). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/products/rsc";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { recordBottleMovement } from "@/lib/bottles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGE = z.enum(["AVAILABLE", "IN_CIRCULATION", "AWAITING_COLLECTION", "CLEANING", "DAMAGED", "LOST"]);

const schema = z.object({
  capacityMl: z.union([z.literal(300), z.literal(500), z.literal(1000)]),
  from: STAGE.nullable().optional(),
  to: STAGE,
  qty: z.number().int().min(1).max(1_000_000),
  reason: z.string().min(1).max(300),
  note: z.string().max(500).optional(),
});

export const POST = route("admin.bottles.movement", async (req: NextRequest) => {
  const role = requirePermission(req, "bottleInventory", "adjust");
  const body = await parseBody(req, schema);
  const res = await recordBottleMovement(
    { capacityMl: body.capacityMl, from: body.from ?? null, to: body.to, qty: body.qty, reason: body.reason, note: body.note },
    { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) },
  );
  await audit({
    actorRole: role,
    action: `bottle.move.${body.from ?? "NEW"}.${body.to}`,
    target: `${body.capacityMl}ml:${res.id}`,
    ctx: reqContext(req),
  });
  return ok({ result: res });
});
