/* =============================================================
   DOODLY — Notification dispatch + the unified notify() helper.
   Reuses the existing Notification model (audit: no duplicate infra).

   Two entry points, one delivery core:
     • notify(userId, opts)  → writes ONE in-app inbox row, then
       delivers the requested external channels INLINE (real-time).
       Used by transactional events (order confirmed, out for
       delivery, delivered).
     • drainPending(limit)   → picks up any Notification rows still
       PENDING (created by other services that only wrote a row) and
       delivers them on their own channel. Cron-driven safety net.

   Consent + safety: every external send respects the customer's
   CustomerPreference opt-ins (emailOptIn / smsOptIn / whatsappOptIn)
   and provider availability. PUSH / IN_APP never leave the app.
   Delivery never throws into the caller — failures are recorded on
   the row (providerStatus / providerLog) and swallowed.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { sendEmail, sendSMS, sendWhatsApp, channelStatus, type SendResult } from "./providers";

type Chan = "SMS" | "WHATSAPP" | "PUSH" | "EMAIL" | "IN_APP";

export interface NotifyOpts {
  title: string;
  body: string;
  /** Inbox row channel — defaults to IN_APP so it shows cleanly once, no duplicates. */
  channel?: Chan;
  email?: boolean;      // also attempt email
  sms?: boolean;        // also attempt SMS
  whatsapp?: boolean;   // also attempt WhatsApp
  emailHtml?: string;   // optional rich HTML body for email (falls back to text)
  emailSubject?: string;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/** Minimal branded HTML wrapper for a plain notification body. */
function defaultHtml(title: string, body: string) {
  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#1c2722">
      <h2 style="color:#0F3D2E;margin:0 0 8px">${escapeHtml(title)}</h2>
      <p style="font-size:15px;line-height:1.55">${escapeHtml(body)}</p>
      <p style="color:#6b7b73;font-size:12px;margin-top:22px">DOODLY · Farm-fresh A2 milk, before 7:00 AM</p>
    </div>`;
}

type Prefs = { emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean } | null;

/** Deliver a single notification row across the given external channels. Records the outcome on the row. */
async function deliverRow(
  rowId: string,
  channels: Chan[],
  user: { email: string | null; phone: string | null },
  prefs: Prefs,
  title: string,
  body: string,
  emailHtml?: string,
  emailSubject?: string,
) {
  const avail = channelStatus();
  const perChannel: Record<string, string> = {};
  let anyOk = false;
  let firstRef: string | undefined;
  let attempted = 0;

  const wants = Array.from(new Set(channels)).filter((c) => c === "EMAIL" || c === "SMS" || c === "WHATSAPP");

  for (const ch of wants) {
    // consent gate (defaults: email on, sms/whatsapp off)
    const optedIn =
      ch === "EMAIL" ? (prefs ? prefs.emailOptIn : true) :
      ch === "SMS" ? (prefs ? prefs.smsOptIn : false) :
      (prefs ? prefs.whatsappOptIn : false);
    if (!optedIn) { perChannel[ch] = "skipped:opt-out"; continue; }

    // provider gate
    const live = ch === "EMAIL" ? avail.email : ch === "SMS" ? avail.sms : avail.whatsapp;
    if (!live) { perChannel[ch] = "skipped:no-provider"; continue; }

    attempted++;
    let res: SendResult;
    if (ch === "EMAIL") res = await sendEmail(user.email, emailSubject || title, emailHtml || defaultHtml(title, body), body);
    else if (ch === "SMS") res = await sendSMS(user.phone, `${title}\n${body}`);
    else res = await sendWhatsApp(user.phone, `*${title}*\n${body}`);

    if (res.ok) { anyOk = true; firstRef = firstRef || res.ref; perChannel[ch] = res.ref ? `sent:${res.ref}` : "sent"; }
    else if (res.skipped) { attempted--; perChannel[ch] = `skipped:${res.error || "unavailable"}`; }
    else perChannel[ch] = `failed:${res.error || "error"}`;
  }

  const providerStatus = anyOk ? "SENT" : attempted > 0 ? "FAILED" : "SKIPPED";
  try {
    await db.notification.update({
      where: { id: rowId },
      data: { providerStatus, providerRef: firstRef || null, providerLog: JSON.stringify(perChannel), dispatchedAt: new Date() },
    });
  } catch (e) {
    log.error("notify.dispatch", "failed to stamp row", { rowId, msg: (e as Error)?.message });
  }
  return { providerStatus, perChannel, ref: firstRef };
}

/**
 * Create an in-app notification and deliver requested external channels in real time.
 * Never throws — safe to call inside (after) a request/transaction.
 */
export async function notify(userId: string, opts: NotifyOpts) {
  try {
    const channel: Chan = opts.channel ?? "IN_APP";
    const row = await db.notification.create({
      data: { userId, channel, title: opts.title, body: opts.body, sentAt: new Date(), providerStatus: "PENDING" },
    });

    const external: Chan[] = [];
    if (opts.email || channel === "EMAIL") external.push("EMAIL");
    if (opts.sms || channel === "SMS") external.push("SMS");
    if (opts.whatsapp || channel === "WHATSAPP") external.push("WHATSAPP");

    if (!external.length) {
      // in-app only → nothing to dispatch, mark terminal so the drain ignores it
      await db.notification.update({ where: { id: row.id }, data: { providerStatus: "SKIPPED", dispatchedAt: new Date() } });
      return { id: row.id, providerStatus: "SKIPPED" as const };
    }

    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    const prefs = await db.customerPreference.findUnique({
      where: { userId }, select: { emailOptIn: true, smsOptIn: true, whatsappOptIn: true },
    });
    const out = await deliverRow(row.id, external, user ?? { email: null, phone: null }, prefs, opts.title, opts.body, opts.emailHtml, opts.emailSubject);
    return { id: row.id, ...out };
  } catch (e) {
    log.error("notify", "notify() failed (swallowed)", { userId, msg: (e as Error)?.message });
    return { id: null, providerStatus: "FAILED" as const };
  }
}

/**
 * Drain the backlog: deliver every PENDING notification on its own channel.
 * Idempotent (only picks PENDING; each row ends terminal). Cron-driven.
 * Only touches rows from the last 7 days as a safety net against stuck rows.
 */
export async function drainPending(limit = 200) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.notification.findMany({
    where: { providerStatus: "PENDING", createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: Math.min(1000, Math.max(1, limit)),
    include: { user: { select: { email: true, phone: true } } },
  });
  if (!rows.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

  // batch-load prefs for the involved users
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const prefRows = await db.customerPreference.findMany({
    where: { userId: { in: userIds } }, select: { userId: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true },
  });
  const prefMap = new Map(prefRows.map((p) => [p.userId, p]));

  let sent = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    const out = await deliverRow(
      r.id, [r.channel as Chan], r.user ?? { email: null, phone: null },
      prefMap.get(r.userId) ?? null, r.title, r.body,
    );
    if (out.providerStatus === "SENT") sent++;
    else if (out.providerStatus === "FAILED") failed++;
    else skipped++;
  }
  log.info("notify.drain", "drain complete", { processed: rows.length, sent, skipped, failed });
  return { processed: rows.length, sent, skipped, failed };
}

// ------------------------------------------------------------------ transactional event templates
/** Order placed → confirmation across in-app + opted channels. */
export function notifyOrderConfirmed(userId: string, o: { number: string }) {
  return notify(userId, {
    title: "Order confirmed 🎉",
    body: `Your DOODLY order ${o.number} is confirmed. Fresh A2 milk will reach you before 7:00 AM. Track it anytime in your dashboard.`,
    email: true, sms: true, whatsapp: true,
  });
}

/** Executive marked the stop en route. */
export function notifyOutForDelivery(userId: string) {
  return notify(userId, {
    title: "Out for delivery 🚚",
    body: "Your DOODLY delivery is on the way and will reach you before 7:00 AM. Please keep your bottle crate ready.",
    email: true, sms: true, whatsapp: true,
  });
}

/** Stop completed. */
export function notifyDelivered(userId: string, d: { bottles?: number } = {}) {
  const b = d.bottles && d.bottles > 0 ? ` We collected ${d.bottles} empty bottle${d.bottles > 1 ? "s" : ""}.` : "";
  return notify(userId, {
    title: "Delivered ✅",
    body: `Your DOODLY milk has been delivered.${b} Thank you for choosing farm-fresh A2. Rate today's delivery in the app.`,
    email: true, sms: true, whatsapp: true,
  });
}

export { channelStatus };
