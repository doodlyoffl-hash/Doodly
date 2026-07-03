/* /api/admin/inventory — raw-material / supplies stock.
   GET  — list items (inventory:view).
   POST — add an item (inventory:create). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.inventory.list", async (req: NextRequest) => {
  requirePermission(req, "inventory", "view");
  const items = await db.inventoryItem.findMany({ orderBy: { name: "asc" } });
  return ok({ items });
});

const createSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers and underscores").min(2).max(40),
  name: z.string().trim().min(2).max(80),
  unit: z.string().trim().min(1).max(20),
  quantity: z.number().nonnegative().optional(),
  reorderAt: z.number().nonnegative().optional(),
});

export const POST = route("admin.inventory.create", async (req: NextRequest) => {
  const role = requirePermission(req, "inventory", "create");
  const body = await parseBody(req, createSchema);
  if (await db.inventoryItem.findUnique({ where: { sku: body.sku } })) throw Errors.conflict("An item with that SKU already exists.");
  const item = await db.inventoryItem.create({
    data: { sku: body.sku, name: body.name, unit: body.unit, quantity: body.quantity ?? 0, reorderAt: body.reorderAt ?? 0 },
  });
  await audit({ actorRole: role, action: "inventory.create", target: item.id, ctx: reqContext(req) });
  return ok({ item }, { status: 201 });
});
