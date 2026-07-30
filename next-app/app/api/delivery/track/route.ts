/* POST /api/delivery/track — the signed-in delivery executive streams a BATCH of GPS
   readings for their OPEN shift. The server stores them and accumulates fraud-filtered
   travelled km (see lib/delivery/gps-track). Offline-queueable: every point carries a
   clientId, so a replay after reconnect never double-counts. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";
import { readRole } from "@/lib/auth/identity";
import { ingestGpsPoints } from "@/lib/delivery/gps-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Point = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracyM: z.number().nonnegative().max(100000).optional().nullable(),
  speed: z.number().optional().nullable(),
  capturedAt: z.string(),                  // ISO timestamp from the device
  clientId: z.string().min(1).max(80),     // idempotency key per reading
});
const Body = z.object({ points: z.array(Point).min(1).max(500) });

export const POST = route("delivery.track", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const role = readRole(req);
  if (role !== "delivery_executive" && role !== "super_admin") throw Errors.forbidden("Executive portal only.");
  const driver = await db.driver.findFirst({ where: { userId, deletedAt: null }, select: { id: true } });
  if (!driver) throw Errors.notFound("No delivery-executive profile is linked to this account.");

  const body = await parseBody(req, Body);
  return ok(await ingestGpsPoints(driver.id, body.points));
});
