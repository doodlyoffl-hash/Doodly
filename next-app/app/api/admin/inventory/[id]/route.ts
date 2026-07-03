/* /api/admin/inventory/[id]
   PATCH  — edit fields / adjust quantity (inventory:edit; quantity change also
            needs the inventory:adjust special, which FULL grants).
   DELETE — remove the item (inventory:delete). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  quantity: z.number().nonnegative().optional(),
  reorderAt: z.number().nonnegative().optional(),
});

export const PATCH = route("admin.inventory.update", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "inventory", "edit");
  const body = await parseBody(req, patchSchema);
  // changing the on-hand quantity is a stock adjustment (FULL-level special).
  if (body.quantity !== undefined) requirePermission(req, "inventory", "adjust");
  if (!(await db.inventoryItem.findUnique({ where: { id: params.id }, select: { id: true } }))) throw Errors.notFound("Item not found.");
  const item = await db.inventoryItem.update({ where: { id: params.id }, data: body });
  await audit({ actorRole: role, action: "inventory.update", target: item.id, ctx: reqContext(req) });
  return ok({ item });
});

export const DELETE = route("admin.inventory.delete", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "inventory", "delete");
  if (!(await db.inventoryItem.findUnique({ where: { id: params.id }, select: { id: true } }))) throw Errors.notFound("Item not found.");
  await db.inventoryItem.delete({ where: { id: params.id } });
  await audit({ actorRole: role, action: "inventory.delete", target: params.id, ctx: reqContext(req) });
  return ok({ deleted: true });
});
