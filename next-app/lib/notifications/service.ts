/* =============================================================
   DOODLY Content → Notifications — service (Prisma).
   Admin campaigns: compose → resolve audience → send. Delivery
   fans out to the existing per-user Notification records (in-app);
   external channels (SMS/WhatsApp/Email) record + queue the same
   per-user notifications but actual provider dispatch needs creds.
   Campaign history, dashboard, soft-delete. Reuses Notification +
   NotifChannel; no duplicate delivery infra.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";
import { channelStatus } from "./providers";

interface Actor { actorId?: string; actorRole?: string }

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export const AUDIENCES = ["All customers", "Active subscribers", "Paused", "Trial users"] as const;
export const CHANNELS = ["WHATSAPP", "SMS", "PUSH", "EMAIL"] as const;
const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: "WhatsApp", SMS: "SMS", PUSH: "Push", EMAIL: "Email" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SENDING: "Sending", SENT: "Sent", FAILED: "Failed" };

type CampaignRow = Prisma.NotificationCampaignGetPayload<{}>;
function shape(c: CampaignRow) {
  return {
    id: c.id, name: c.name, audience: c.audience, channel: c.channel, channelLabel: CHANNEL_LABEL[c.channel] || c.channel,
    title: c.title, message: c.message, status: c.status, statusLabel: STATUS_LABEL[c.status] || c.status,
    recipientCount: c.recipientCount, deliveredCount: c.deliveredCount, sentAt: c.sentAt, deletedAt: c.deletedAt, createdAt: c.createdAt,
  };
}

export const CampaignSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal("")),
  audience: z.enum(AUDIENCES),
  channel: z.enum(CHANNELS),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(4000),
});

/** Resolve an audience label → the target user ids (deduped, non-deleted). */
async function resolveAudience(audience: string): Promise<{ id: string }[]> {
  if (audience === "Active subscribers") {
    const subs = await db.subscription.findMany({ where: { status: "ACTIVE", user: { deletedAt: null } }, select: { userId: true }, distinct: ["userId"] });
    return subs.map((s) => ({ id: s.userId }));
  }
  if (audience === "Paused") {
    const subs = await db.subscription.findMany({ where: { status: { in: ["PAUSED", "VACATION"] }, user: { deletedAt: null } }, select: { userId: true }, distinct: ["userId"] });
    return subs.map((s) => ({ id: s.userId }));
  }
  if (audience === "Trial users") {
    return db.user.findMany({ where: { deletedAt: null, trialCashback: { isNot: null } }, select: { id: true } });
  }
  // All customers
  return db.user.findMany({ where: { deletedAt: null, role: "CUSTOMER" }, select: { id: true } });
}

export async function audienceCount(audience: string): Promise<number> {
  return (await resolveAudience(audience)).length;
}

// ---------------------------------------------------------------- list + detail
export interface CampaignFilters { q?: string; status?: string; channel?: string; from?: string; to?: string; page?: number; pageSize?: number; includeDeleted?: boolean }
export async function listCampaigns(f: CampaignFilters = {}) {
  const where: Prisma.NotificationCampaignWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.status) where.status = f.status as CampaignRow["status"];
  if (f.channel) where.channel = f.channel as CampaignRow["channel"];
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ name: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, { audience: { contains: q, mode: "insensitive" } }]; }
  const total = await db.notificationCampaign.count({ where });
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  const rows = await db.notificationCampaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize });
  return { campaigns: rows.map(shape), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
export async function campaignDetail(id: string) {
  const c = await db.notificationCampaign.findUnique({ where: { id } });
  if (!c) throw new Error("Campaign not found");
  return shape(c);
}

// ---------------------------------------------------------------- create + send
export async function createCampaign(raw: unknown, actor: Actor) {
  const d = CampaignSchema.parse(raw);
  const count = await audienceCount(d.audience);
  const c = await db.notificationCampaign.create({
    data: { name: (d.name && d.name.trim()) || `${CHANNEL_LABEL[d.channel]} · ${d.audience}`, audience: d.audience, channel: d.channel, title: d.title?.trim() || null, message: d.message, status: "DRAFT", recipientCount: count, createdById: actor.actorId ?? null },
  });
  return shape(c);
}

/** Send a campaign: fan out per-user Notification records (in-app), stamp SENT + counts. */
export async function sendCampaign(id: string, actor: Actor) {
  const c = await db.notificationCampaign.findUnique({ where: { id } });
  if (!c) throw new Error("Campaign not found");
  if (c.status === "SENT") throw new Error("Campaign already sent.");
  const recipients = await resolveAudience(c.audience);
  const title = c.title || `${CHANNEL_LABEL[c.channel]} update`;
  let delivered = 0;
  // chunk the fan-out to keep the write batch reasonable
  const CHUNK = 500;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK);
    const res = await db.notification.createMany({
      // In-app fan-out. providerStatus SKIPPED keeps the transactional drain from
      // auto-blasting a marketing campaign as SMS/WhatsApp/Email — external
      // campaign delivery is a separate, marketing-consent-aware path (roadmap).
      data: slice.map((u) => ({ userId: u.id, channel: c.channel, title, body: c.message, sentAt: new Date(), providerStatus: "SKIPPED" })),
      skipDuplicates: true,
    });
    delivered += res.count;
  }
  const updated = await db.notificationCampaign.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), recipientCount: recipients.length, deliveredCount: delivered } });
  return shape(updated);
}

export async function createAndSend(raw: unknown, actor: Actor) {
  const created = await createCampaign(raw, actor);
  return sendCampaign(created.id, actor);
}

export const softDeleteCampaign = async (id: string) => shape(await db.notificationCampaign.update({ where: { id }, data: { deletedAt: new Date() } }));
export const restoreCampaign = async (id: string) => shape(await db.notificationCampaign.update({ where: { id }, data: { deletedAt: null } }));

// ---------------------------------------------------------------- dashboard
export async function notificationsDashboard() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [all, reachedAgg, sentToday, byChannel, dispatchAgg] = await Promise.all([
    db.notificationCampaign.findMany({ where: { deletedAt: null }, select: { status: true } }),
    db.notificationCampaign.aggregate({ where: { deletedAt: null, status: "SENT" }, _sum: { deliveredCount: true } }),
    db.notificationCampaign.count({ where: { deletedAt: null, sentAt: { gte: soD(now) } } }),
    db.notificationCampaign.groupBy({ by: ["channel"], where: { deletedAt: null }, _count: { _all: true } }),
    // real external-send health over the last 30 days (transactional notifications)
    db.notification.groupBy({ by: ["providerStatus"], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
  ]);
  const count = (s: string) => all.filter((x) => x.status === s).length;
  const dcount = (s: string) => dispatchAgg.find((d) => d.providerStatus === s)?._count._all ?? 0;
  return {
    kpis: {
      total: all.length, sent: count("SENT"), drafts: count("DRAFT"), reached: reachedAgg._sum.deliveredCount ?? 0, sentToday,
    },
    byChannel: byChannel.map((r) => ({ channel: CHANNEL_LABEL[r.channel] || r.channel, count: r._count._all })),
    // live provider availability so the admin sees which channels can actually send
    channels: channelStatus(),
    // 30-day transactional dispatch outcomes
    dispatch: { sent: dcount("SENT"), failed: dcount("FAILED"), skipped: dcount("SKIPPED"), pending: dcount("PENDING") },
  };
}
