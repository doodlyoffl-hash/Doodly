/* POST /api/admin/bottles/adjust — manual per-customer bottle-ledger correction
   (the "manual admin adjustment" edge case). { userId, event, qty, note }.
   Appends a BottleLedger row (ISSUED/RETURNED/LOST) + AuditLog. RBAC bottleInventory:adjust. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string().min(1),
  event: z.enum(["ISSUED", "RETURNED", "LOST"]),
  qty: z.number().int().min(1).max(10000),
  note: z.string().max(500).optional(),
});

export const POST = route("admin.bottles.adjust", async (req: NextRequest) => {
  const role = requirePermission(req, "bottleInventory", "adjust");
  const body = await parseBody(req, schema);
  const user = await db.user.findUnique({ where: { id: body.userId }, select: { id: true } });
  if (!user) throw Errors.notFound("Customer not found.");
  const row = await db.bottleLedger.create({
    data: { userId: body.userId, event: body.event, qty: body.qty, note: body.note?.trim() || "Manual admin adjustment" },
    select: { id: true },
  });
  await audit({ userId: readUserId(req) ?? null, actorRole: role, action: `bottle.adjust.${body.event}`, target: `${body.qty} · customer ${body.userId} · ${row.id}`, ctx: reqContext(req) });
  return ok({ id: row.id });
});
