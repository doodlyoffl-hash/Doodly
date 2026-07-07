/* /api/admin/whatsapp — WhatsApp (Superfone) integration console.
   GET  (notifications:view) — connection status, approved template list pulled
        LIVE from Superfone, and recent WhatsApp delivery logs. No secrets ever
        leave the server (only a boolean `configured`).
   POST (notifications:edit) —
        { action:"test", phone, template?, vars?, text? } → real test message
        { action:"retry", notificationId }               → re-queue a failed row
        { action:"poll" }                                → refresh delivery statuses now */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import { sendWhatsApp, channelStatus } from "@/lib/notifications/providers";
import { superfone, superfoneListTemplates, superfoneGetMessage } from "@/lib/notifications/superfone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("admin.whatsapp.status", async (req: NextRequest) => {
  requirePermission(req, "notifications", "view");
  const cs = channelStatus();
  const templates = superfone.configured() ? await superfoneListTemplates() : { ok: false as const, error: "not-configured" };
  const logs = await db.notification.findMany({
    where: { OR: [{ channel: "WHATSAPP" }, { providerRef: { startsWith: "wamid." } }] },
    orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, userId: true, title: true, providerStatus: true, providerRef: true, providerLog: true, createdAt: true, user: { select: { name: true, phone: true } } },
  });
  return ok({
    provider: superfone.configured() ? "superfone" : cs.whatsapp ? "fallback" : "none",
    configured: superfone.configured(),
    channelLive: cs.whatsapp,
    sessionTextAllowed: superfone.sessionTextAllowed(),
    templates: templates.ok ? templates.templates : [],
    templatesError: templates.ok ? null : templates.error,
    logs,
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), phone: z.string().min(10).max(16), template: z.string().max(60).optional(), vars: z.array(z.string().max(200)).max(10).optional(), text: z.string().max(1000).optional() }),
  z.object({ action: z.literal("retry"), notificationId: z.string().min(1) }),
  z.object({ action: z.literal("poll"), wamid: z.string().min(5).optional() }),
]);

export const POST = route("admin.whatsapp.action", async (req: NextRequest) => {
  const role = requirePermission(req, "notifications", "edit");
  const body = await parseBody(req, schema);

  if (body.action === "test") {
    const res = await sendWhatsApp(body.phone, {
      text: body.text || "DOODLY test message — your WhatsApp integration is working. 🥛",
      template: body.template || null,
      vars: body.vars ?? [],
    });
    await audit({ actorRole: role, action: "whatsapp.test", target: `${body.phone.slice(-4)} ${body.template || "text"} → ${res.ok ? "sent" : res.error}`, ctx: reqContext(req) });
    return ok({ sent: res.ok, ref: res.ref ?? null, error: res.ok ? null : res.error });
  }

  if (body.action === "retry") {
    const row = await db.notification.findUnique({ where: { id: body.notificationId }, select: { id: true, providerStatus: true } });
    if (!row) throw Errors.notFound("Notification not found.");
    if (row.providerStatus !== "FAILED") throw Errors.badRequest("Only FAILED messages can be retried.");
    await db.notification.update({ where: { id: row.id }, data: { providerStatus: "PENDING", providerLog: null } });
    await audit({ actorRole: role, action: "whatsapp.retry", target: row.id, ctx: reqContext(req) });
    return ok({ requeued: true, note: "The next cron drain (or a manual drain) will re-deliver this message." });
  }

  // poll — refresh one wamid or report provider reachability
  if (body.wamid) {
    const r = await superfoneGetMessage(body.wamid);
    if (!r.ok) throw Errors.badRequest(r.error || "Could not fetch the message status.");
    return ok({ status: r.status, statuses: r.statuses });
  }
  const t = await superfoneListTemplates();
  return ok({ reachable: t.ok, templates: t.ok ? t.templates?.length : 0, error: t.ok ? null : t.error });
});
