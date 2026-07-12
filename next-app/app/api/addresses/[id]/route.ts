/* /api/addresses/[id] — mutate one of the signed-in customer's addresses.
   Ownership is enforced on every verb (a customer can only touch their own).
   PATCH  — edit fields / set as default
   DELETE — remove the address. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { audit } from "@/lib/auth/audit";
import { addressFields, assertServiceable, buildAddressData, cleanStr, LOCATION_KEYS } from "@/lib/addresses/helpers";
import { geocodeAddress } from "@/lib/geo/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

async function ownedOr404(userId: string, id: string) {
  const addr = await db.address.findFirst({ where: { id, userId }, select: { id: true, pincode: true } });
  if (!addr) throw Errors.notFound("Address not found.");
  return addr;
}

const patchSchema = z.object(addressFields).extend({
  pincode: z.string().transform((s) => s.replace(/\D/g, "").slice(0, 6)).refine((v) => /^[1-9]\d{5}$/.test(v), "Enter a valid 6-digit pincode").optional(),
});

// simple (non-location) fields that a partial PATCH can set without re-validating serviceability
const SIMPLE_KEYS = ["label", "deliveryNote", "contactName", "contactPhone", "altPhone", "block", "wing", "gateNumber", "doorColor"] as const;

export const PATCH = route("addresses.update", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUserId(req);
  const current = await ownedOr404(userId, params.id);
  const parsed = await parseBody(req, patchSchema);
  const body = parsed as Record<string, unknown>;

  const editingLocation = LOCATION_KEYS.some((k) => body[k] !== undefined);
  let data: Record<string, unknown>;

  if (editingLocation) {
    // any location change re-validates serviceability + recomposes the address
    const pincode = (typeof body.pincode === "string" && body.pincode) || current.pincode;
    const sp = await assertServiceable(pincode);
    data = buildAddressData(body, sp);
    data.pincode = pincode;
    // No pin dropped → best-effort keyless geocode so tracking has a destination.
    if (data.lat == null || data.lng == null) {
      const geo = await geocodeAddress({ ...data, pincode });
      if (geo) { data.lat = geo.lat; data.lng = geo.lng; }
    }
  } else {
    // simple partial (set default / edit note / label / contact) — no location touch
    data = {};
    for (const k of SIMPLE_KEYS) if (body[k] !== undefined) data[k] = cleanStr(body[k] as string);
  }

  const address = await db.$transaction(async (tx) => {
    if (parsed.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({ where: { id: params.id }, data: { ...data, ...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}) } as Prisma.AddressUncheckedUpdateInput });
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
