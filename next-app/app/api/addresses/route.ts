/* /api/addresses — the signed-in customer's delivery addresses.
   GET  — list (own addresses only)
   POST — add an address (first one, or isDefault, becomes the default). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { reqContext } from "@/lib/auth/request";
import { addressFields } from "@/lib/addresses/helpers";
import { createDeliverableAddress } from "@/lib/addresses/create";

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
  // ONE shared deliverable-address path (serviceable + coords + pin-verify + warehouse radius).
  const address = await createDeliverableAddress(userId, body as Record<string, unknown> & { pincode: string }, { actorRole: "customer", actorUserId: userId, ctx: reqContext(req) });
  return ok({ address, needsPin: false, verified: address.verified }, { status: 201 });
});
