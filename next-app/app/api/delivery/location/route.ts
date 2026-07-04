/* POST /api/delivery/location — the signed-in delivery executive reports their
   live GPS position while on route. Updates Driver.lat/lng/lastSeenAt so the
   admin route view + the customer tracking map can show them moving. Cheap +
   idempotent; called every ~30s by the driver portal. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracy: z.number().nonnegative().optional(),
});

export const POST = route("delivery.location", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const role = readRole(req);
  if (role !== "delivery_executive" && role !== "super_admin") throw Errors.forbidden("Executive portal only.");
  const driver = await db.driver.findFirst({ where: { userId, deletedAt: null }, select: { id: true } });
  if (!driver) throw Errors.notFound("No delivery-executive profile is linked to this account.");

  const body = await parseBody(req, Body);
  await db.driver.update({ where: { id: driver.id }, data: { lat: body.lat, lng: body.lng, lastSeenAt: new Date() } });
  return ok({ ok: true });
});
