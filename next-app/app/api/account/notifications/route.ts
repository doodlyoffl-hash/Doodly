/* /api/account/notifications — the signed-in customer's in-app inbox.
   GET  → latest 50 notifications + unread count.
   POST { action: "read", id } | { action: "readAll" } | { action: "delete", id }
   Own-data only: every query is scoped to the verified user id. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, route, parseBody, Errors } from "@/lib/http";
import { requireUserId } from "@/lib/auth/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("account.notifications", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return ok({ notifications, unread });
});

const Body = z.object({
  action: z.enum(["read", "readAll", "delete"]),
  id: z.string().optional(),
});

export const POST = route("account.notifications.post", async (req: NextRequest) => {
  const userId = requireUserId(req);
  const body = await parseBody(req, Body);
  if (body.action === "readAll") {
    await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return ok({ done: true });
  }
  if (!body.id) throw Errors.badRequest("id is required.");
  // updateMany/deleteMany scoped by userId → a customer can never touch another customer's rows
  if (body.action === "read") {
    await db.notification.updateMany({ where: { id: body.id, userId }, data: { readAt: new Date() } });
  } else {
    await db.notification.deleteMany({ where: { id: body.id, userId } });
  }
  return ok({ done: true });
});
