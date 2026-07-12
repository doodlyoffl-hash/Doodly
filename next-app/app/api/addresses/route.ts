/* /api/addresses — the signed-in customer's delivery addresses.
   GET  — list (own addresses only)
   POST — add an address (first one, or isDefault, becomes the default). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { addressFields, assertServiceable, buildAddressData } from "@/lib/addresses/helpers";
import { geocodeAddress } from "@/lib/geo/geocode";

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

const createSchema = z.object(addressFields).extend({
  // normalise before validating: a geocoder-autofilled "520 010" is a valid pincode
  pincode: z.string().transform((s) => s.replace(/\D/g, "").slice(0, 6)).refine((v) => /^[1-9]\d{5}$/.test(v), "Enter a valid 6-digit pincode"),
});

export const POST = route("addresses.create", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, createSchema);

  // pincode must be inside DOODLY's serviceable area (also gives us area/city/state/zone)
  const sp = await assertServiceable(body.pincode);
  const data = buildAddressData(body as Record<string, unknown>, sp) as Record<string, unknown> & { lat?: number | null; lng?: number | null };

  // No pin dropped (no Google key / manual entry) → best-effort keyless geocode so
  // live delivery tracking has a destination. Never blocks the save on failure.
  if (data.lat == null || data.lng == null) {
    const geo = await geocodeAddress({ ...(data as Record<string, unknown>), pincode: body.pincode });
    if (geo) { data.lat = geo.lat; data.lng = geo.lng; }
  }

  const count = await db.address.count({ where: { userId } });
  const makeDefault = body.isDefault || count === 0;

  const address = await db.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { userId, ...data, pincode: body.pincode, isDefault: makeDefault } as Prisma.AddressUncheckedCreateInput });
  });

  await audit({ userId, actorRole: "customer", action: "address.create", target: address.id, ctx: reqContext(req) });
  return ok({ address }, { status: 201 });
});
