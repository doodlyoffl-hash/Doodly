/* /api/devices — push-notification device registry for the mobile apps.

   POST   register (or refresh) this device's push token for the signed-in user.
          Called on every app launch after permission is granted, because the
          provider can rotate a token at any time and a stale one silently
          stops delivering.
   DELETE unregister on sign-out, so a shared or handed-over phone stops
          receiving the previous user's notifications.
   GET    list this user's registered devices (Profile → "where you're signed in").

   Self-scoped only: every query is bound to requireUserId(req); there is no
   way to register or read a token for another user. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Expo tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] (or a raw
// FCM/APNs token in a bare workflow). Validate loosely on shape but strictly
// on length, so a malformed value can't bloat the table.
const registerSchema = z.object({
  token: z.string().trim().min(10).max(300),
  platform: z.enum(["ios", "android"]),
  app: z.enum(["customer", "driver"]),
  deviceName: z.string().trim().max(80).optional().nullable(),
  appVersion: z.string().trim().max(24).optional().nullable(),
});

export const POST = route("devices.register", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, registerSchema);

  // Upsert on the TOKEN, not (userId, token): the same physical device is
  // re-issued the same token after a reinstall, so if a different account
  // signs in we must move the row rather than duplicate it — otherwise the
  // previous owner keeps receiving this device's notifications.
  const device = await db.deviceToken.upsert({
    where: { token: body.token },
    create: {
      userId,
      token: body.token,
      platform: body.platform,
      app: body.app,
      deviceName: body.deviceName ?? null,
      appVersion: body.appVersion ?? null,
    },
    update: {
      userId,
      platform: body.platform,
      app: body.app,
      deviceName: body.deviceName ?? null,
      appVersion: body.appVersion ?? null,
      lastSeenAt: new Date(),
      disabledAt: null,     // re-registering revives a row we'd retired
      failCount: 0,
    },
    select: { id: true, platform: true, app: true, createdAt: true },
  });

  return ok({ device });
});

const removeSchema = z.object({ token: z.string().trim().min(10).max(300) });

export const DELETE = route("devices.unregister", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const { token } = await parseBody(req, removeSchema);
  const r = await db.deviceToken.deleteMany({ where: { userId, token } });
  if (r.count === 0) throw Errors.notFound("That device isn't registered.");
  return ok({ removed: r.count });
});

export const GET = route("devices.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const devices = await db.deviceToken.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    // Never return the token itself — it is a send credential, and the
    // client already knows its own.
    select: { id: true, platform: true, app: true, deviceName: true, appVersion: true, lastSeenAt: true, disabledAt: true },
  });
  return ok({ devices });
});
