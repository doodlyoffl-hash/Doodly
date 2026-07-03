/* /api/addresses/[id] — mutate one of the signed-in customer's addresses.
   Ownership is enforced on every verb (a customer can only touch their own).
   PATCH  — edit fields / set as default
   DELETE — remove the address. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

async function ownedOr404(userId: string, id: string) {
  const addr = await db.address.findFirst({ where: { id, userId }, select: { id: true } });
  if (!addr) throw Errors.notFound("Address not found.");
}

const patchSchema = z.object({
  label: z.string().trim().max(30).optional(),
  line1: z.string().trim().min(3).max(120).optional(),
  line2: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().min(2).max(60).optional(),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode").optional(),
  deliveryNote: z.string().trim().max(160).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const PATCH = route("addresses.update", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  await ownedOr404(userId, params.id);
  const body = await parseBody(req, patchSchema);

  const address = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({ where: { id: params.id }, data: body });
  });

  await audit({ userId, actorRole: "customer", action: "address.update", target: address.id, ctx: reqContext(req) });
  return ok({ address });
});

export const DELETE = route("addresses.delete", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  await ownedOr404(userId, params.id);
  await db.address.delete({ where: { id: params.id } });
  await audit({ userId, actorRole: "customer", action: "address.delete", target: params.id, ctx: reqContext(req) });
  return ok({ deleted: true });
});
