/* /api/notifications — the signed-in customer's notifications.
   GET   — list (newest first) + unread count.
   PATCH — mark one ({id}) or all ({all:true}) as read. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("notifications.list", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, channel: true, title: true, body: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return ok({ notifications, unread });
});

const patchSchema = z.object({ id: z.string().min(1).optional(), all: z.boolean().optional() })
  .refine((d) => d.id || d.all, "Provide an id or all:true");

export const PATCH = route("notifications.read", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, patchSchema);
  if (body.all) {
    await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  } else {
    const owned = await db.notification.findFirst({ where: { id: body.id, userId }, select: { id: true } });
    if (!owned) throw Errors.notFound("Notification not found.");
    await db.notification.update({ where: { id: body.id }, data: { readAt: new Date() } });
  }
  const unread = await db.notification.count({ where: { userId, readAt: null } });
  return ok({ unread });
});
