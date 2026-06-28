/* =============================================================
   Auto Delivery Assignment — notifications.
   Writes Notification rows (in-app/push). Future-ready: swap the
   `dispatch` body for a real SMS/WhatsApp/Email provider per channel.
   Accepts a Prisma client OR a transaction client so notifications
   participate in the same transaction as the assignment write.
   ============================================================= */
import type { Prisma, NotifChannel } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

/** Events sent to a delivery executive. */
export const EXEC_EVENT = {
  NEW_TRIP: "New trip assigned",
  ASSIGNMENT_UPDATED: "Assignment updated",
  MANUAL_REASSIGN: "Trip reassigned",
  ROUTE_CHANGED: "Route changed",
  NEW_TRIP_AFTER_RETURN: "New trip after returning",
} as const;

/** Events sent to admins/operations. */
export const ADMIN_EVENT = {
  NO_EXECUTIVES: "No executives available",
  QUEUE_GROWING: "Pending queue growing",
  TRIP_OVERDUE: "Executive trip overdue",
  ASSIGNMENT_FAILURE: "Assignment failure",
} as const;

export async function notifyExecutive(
  client: Client, driverUserId: string, title: string, body: string, channel: NotifChannel = "PUSH",
) {
  await client.notification.create({ data: { userId: driverUserId, channel, title, body, sentAt: new Date() } });
}

export async function notifyAdmins(
  client: Client, title: string, body: string, channel: NotifChannel = "PUSH",
) {
  const admins = await client.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN", "OPERATIONS"] }, status: "ACTIVE" },
    select: { id: true },
  });
  if (!admins.length) return;
  await client.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, channel, title, body, sentAt: new Date() })),
  });
}
