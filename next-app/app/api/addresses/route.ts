/* /api/addresses — the signed-in customer's delivery addresses.
   GET  — list (own addresses only)
   POST — add an address (first one, or isDefault, becomes the default). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("addresses.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const addresses = await db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { label: "asc" }],
  });
  return ok({ addresses });
});

const createSchema = z.object({
  label: z.string().trim().max(30).optional(),
  line1: z.string().trim().min(3, "Enter the address").max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode"),
  deliveryNote: z.string().trim().max(160).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isDefault: z.boolean().optional(),
});

export const POST = route("addresses.create", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, createSchema);

  const count = await db.address.count({ where: { userId } });
  const makeDefault = body.isDefault || count === 0;

  const address = await db.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({
      data: {
        userId,
        label: body.label || "Home",
        line1: body.line1,
        line2: body.line2 ?? null,
        city: body.city,
        pincode: body.pincode,
        deliveryNote: body.deliveryNote ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        isDefault: makeDefault,
      },
    });
  });

  await audit({ userId, actorRole: "customer", action: "address.create", target: address.id, ctx: reqContext(req) });
  return ok({ address }, { status: 201 });
});
