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
import * as T from "@/lib/email/templates";

type Chan = "SMS" | "WHATSAPP" | "PUSH" | "EMAIL" | "IN_APP";

/** SMS/WhatsApp spec: `template` = MSG91 event key (DLT/WA template), `vars` = ordered values. */
export type ChannelSpec = { template?: string; vars?: string[] };

export interface NotifyOpts {
  title: string;
  body: string;
  /** Inbox row channel — defaults to IN_APP so it shows cleanly once, no duplicates. */
  channel?: Chan;
  email?: boolean;                     // also attempt email
  sms?: boolean | ChannelSpec;         // also attempt SMS (object carries the MSG91 template)
  whatsapp?: boolean | ChannelSpec;    // also attempt WhatsApp
  emailHtml?: string;   // optional rich HTML body for email (falls back to text)
  emailSubject?: string;
}

/** Normalise a boolean|ChannelSpec flag into a spec (or null when the channel is off). */
function toSpec(v: boolean | ChannelSpec | undefined, on: boolean): ChannelSpec | null {
  if (v && typeof v === "object") return v;
  return (v || on) ? {} : null;
}

interface DeliverPlan { email: boolean; sms: ChannelSpec | null; whatsapp: ChannelSpec | null }

/** Premium branded HTML for a plain notification body (DOODLY email design system). */
function defaultHtml(title: string, body: string) {
  return T.notificationHtml(title, body);
}

type Prefs = { emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean } | null;

/** Deliver a single notification row across the planned external channels. Records the outcome on the row. */
async function deliverRow(
  rowId: string,
  plan: DeliverPlan,
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

  const wants: Chan[] = [];
  if (plan.email) wants.push("EMAIL");
  if (plan.sms) wants.push("SMS");
  if (plan.whatsapp) wants.push("WHATSAPP");

  for (const ch of wants) {
    // consent gate (defaults: email on, sms/whatsapp off)
    const optedIn =
      ch === "EMAIL" ? (prefs ? prefs.emailOptIn : true) :
      ch === "SMS" ? (prefs ? prefs.smsOptIn : false) :
      (prefs ? prefs.whatsappOptIn : true);   // WhatsApp defaults ON (opt-out respected via the row)
    if (!optedIn) { perChannel[ch] = "skipped:opt-out"; continue; }

    // provider gate
    const live = ch === "EMAIL" ? avail.email : ch === "SMS" ? avail.sms : avail.whatsapp;
    if (!live) { perChannel[ch] = "skipped:no-provider"; continue; }

    attempted++;
    let res: SendResult;
    if (ch === "EMAIL") res = await sendEmail(user.email, emailSubject || title, emailHtml || defaultHtml(title, body), body);
    else if (ch === "SMS") res = await sendSMS(user.phone, { text: `${title}\n${body}`, template: plan.sms!.template, vars: plan.sms!.vars });
    else res = await sendWhatsApp(user.phone, { text: `*${title}*\n${body}`, template: plan.whatsapp!.template, vars: plan.whatsapp!.vars });

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

    const plan: DeliverPlan = {
      email: !!(opts.email || channel === "EMAIL"),
      sms: toSpec(opts.sms, channel === "SMS"),
      whatsapp: toSpec(opts.whatsapp, channel === "WHATSAPP"),
    };

    if (!plan.email && !plan.sms && !plan.whatsapp) {
      // in-app only → nothing to dispatch, mark terminal so the drain ignores it
      await db.notification.update({ where: { id: row.id }, data: { providerStatus: "SKIPPED", dispatchedAt: new Date() } });
      return { id: row.id, providerStatus: "SKIPPED" as const };
    }

    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    const prefs = await db.customerPreference.findUnique({
      where: { userId }, select: { emailOptIn: true, smsOptIn: true, whatsappOptIn: true },
    });
    const out = await deliverRow(row.id, plan, user ?? { email: null, phone: null }, prefs, opts.title, opts.body, opts.emailHtml, opts.emailSubject);
    return { id: row.id, ...out };
  } catch (e) {
    log.error("notify", "notify() failed (swallowed)", { userId, msg: (e as Error)?.message });
    return { id: null, providerStatus: "FAILED" as const };
  }
}

/**
 * Send a branded email to a user IF they've opted in (default on) and email is
 * live. Standalone (writes no notification row) — for events that already created
 * their own in-app row (e.g. wallet credits). `build(name)` lets the template use
 * the recipient's name. Never throws.
 */
export async function emailIfOptedIn(userId: string, build: (name: string | null) => { subject: string; html: string; text: string }) {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) return;
    const pref = await db.customerPreference.findUnique({ where: { userId }, select: { emailOptIn: true } });
    if (pref && !pref.emailOptIn) return;          // customer opted out of email
    if (!channelStatus().email) return;            // no email provider configured
    const e = build(user.name);
    await sendEmail(user.email, e.subject, e.html, e.text);
  } catch (e) {
    log.error("notify.emailIfOptedIn", (e as Error)?.message ?? "failed", { userId });
  }
}

/**
 * Drain the backlog: deliver every PENDING notification on its own channel.
 * Idempotent (only picks PENDING; each row ends terminal). Cron-driven.
 * Only touches rows from the last 7 days as a safety net against stuck rows.
 */
type PendingRow = { id: string; userId: string; channel: string; title: string; body: string; user: { email: string | null; phone: string | null } | null };

/** Deliver a batch of PENDING rows on each row's own channel. Shared by the
 *  cron drain and campaign delivery — one source of truth for the per-row
 *  provider dispatch + opt-in gating + row stamping. */
async function processPending(rows: PendingRow[], budgetMs?: number) {
  if (!rows.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const prefRows = await db.customerPreference.findMany({
    where: { userId: { in: userIds } }, select: { userId: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true },
  });
  const prefMap = new Map(prefRows.map((p) => [p.userId, p]));
  const start = Date.now();
  let sent = 0, skipped = 0, failed = 0, processed = 0;
  for (const r of rows) {
    // Stay within the serverless time budget — leftover rows remain PENDING for
    // the daily drain / a manual drain / retry, so a large audience never times out.
    if (budgetMs && processed > 0 && Date.now() - start > budgetMs) break;
    // rows carry no template info → email/Twilio free-text; MSG91 skips (no template).
    const plan: DeliverPlan = { email: r.channel === "EMAIL", sms: r.channel === "SMS" ? {} : null, whatsapp: r.channel === "WHATSAPP" ? {} : null };
    const out = await deliverRow(r.id, plan, r.user ?? { email: null, phone: null }, prefMap.get(r.userId) ?? null, r.title, r.body);
    if (out.providerStatus === "SENT") sent++;
    else if (out.providerStatus === "FAILED") failed++;
    else skipped++;
    processed++;
  }
  return { processed, sent, skipped, failed };
}

export async function drainPending(limit = 200) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.notification.findMany({
    where: { providerStatus: "PENDING", createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: Math.min(1000, Math.max(1, limit)),
    include: { user: { select: { email: true, phone: true } } },
  });
  const res = await processPending(rows);
  log.info("notify.drain", "drain complete", res);
  return res;
}

/** Deliver a marketing campaign's queued rows on its channel — reuses the exact
 *  same per-row sender + opt-in gating as the cron drain. Bounded by `limit`;
 *  called inline on send and again by retry / the daily drain for any remainder. */
export async function deliverCampaignQueue(campaignId: string, limit = 500, budgetMs = 8000) {
  const rows = await db.notification.findMany({
    where: { campaignId, providerStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: Math.min(2000, Math.max(1, limit)),
    include: { user: { select: { email: true, phone: true } } },
  });
  const res = await processPending(rows, budgetMs);
  log.info("notify.campaign", "campaign delivery batch", { campaignId, ...res });
  return res;
}

// ------------------------------------------------------------------ transactional event templates
// The `template` keys below must match the MSG91 template maps
// (MSG91_SMS_TEMPLATES / MSG91_WHATSAPP_TEMPLATES) and the `vars` order must
// match the registered DLT/WhatsApp template placeholders. See docs/MSG91-SETUP.md.

/** First name for template personalisation ({{name}} vars). Never throws. */
export async function firstNameOf(userId: string): Promise<string> {
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    return (u?.name || "").trim().split(/\s+/)[0] || "there";
  } catch { return "there"; }
}
const rs = (paise?: number | null) => Math.round((paise ?? 0) / 100).toLocaleString("en-IN");

/** Order placed → confirmation across in-app + opted channels. Email = branded template.
    WhatsApp template vars: [name, order number, amount ₹, first delivery]. */
export async function notifyOrderConfirmed(userId: string, o: { number: string; amountPaise?: number; firstDelivery?: string }) {
  const title = "Order confirmed 🎉";
  const body = `Your DOODLY order ${o.number} is confirmed. Fresh A2 milk will reach you before 7:00 AM. Track it anytime in your dashboard.`;
  const name = await firstNameOf(userId);
  let amountPaise = o.amountPaise;
  if (amountPaise == null) {   // verify/webhook callers only know the number — resolve the total
    try {
      const ord = await db.order.findFirst({ where: { id: { endsWith: o.number.replace(/^DOO-/i, "").toLowerCase() } }, select: { totalPaise: true } });
      amountPaise = ord?.totalPaise ?? 0;
    } catch { amountPaise = 0; }
  }
  return notify(userId, {
    title, body,
    email: true,
    emailSubject: `Order ${o.number} confirmed 🎉`,
    emailHtml: T.notificationHtml(title, body, { label: "Track Order", href: "/account/tracking.html" }, "✅"),
    sms: { template: "order_confirmed", vars: [o.number] },
    whatsapp: { template: "order_confirmed", vars: [name, o.number, rs(amountPaise), o.firstDelivery || "tomorrow"] },
  });
}

/** Executive marked the stop en route. Email = branded "Out for delivery" template. */
export async function notifyOutForDelivery(userId: string) {
  const e = T.outForDelivery({});
  return notify(userId, {
    title: "Out for delivery 🚚",
    body: "Your DOODLY delivery is on the way and will reach you before 7:00 AM. Please keep your bottle crate ready.",
    email: true, emailSubject: e.subject, emailHtml: e.html,
    sms: { template: "out_for_delivery" },
    whatsapp: { template: "out_for_delivery", vars: [] },   // live template: no variables
  });
}

/** Stop completed. Email = branded "Delivered" template (bottle-return + rate CTA). */
export async function notifyDelivered(userId: string, d: { bottles?: number } = {}) {
  const b = d.bottles && d.bottles > 0 ? ` We collected ${d.bottles} empty bottle${d.bottles > 1 ? "s" : ""}.` : "";
  const e = T.delivered({ bottles: d.bottles });
  return notify(userId, {
    title: "Delivered ✅",
    body: `Your DOODLY milk has been delivered.${b} Thank you for choosing farm-fresh A2. Rate today's delivery in the app.`,
    email: true, emailSubject: e.subject, emailHtml: e.html,
    sms: { template: "delivered" },
    whatsapp: { template: "delivered", vars: [String(d.bottles ?? 0)] },   // live template: [bottles]
  });
}

export { channelStatus };
