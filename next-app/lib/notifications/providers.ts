/* =============================================================
   DOODLY — Notification provider dispatch (SMS / WhatsApp / Email)
   Low-level senders for the real external channels. Every sender is
   FALLBACK-SAFE: with no provider key it logs + returns skipped,
   never throws, so notifications degrade to in-app only and nothing
   in the request path breaks. Keys live ONLY in server env (Vercel):
     Email    → RESEND_API_KEY            (+ EMAIL_FROM)
     SMS      → TWILIO_* (+ TWILIO_SMS_FROM) or MSG91_AUTH_KEY (+ MSG91_SENDER_ID)
     WhatsApp → SUPERFONE_API_KEY (preferred; see superfone.ts) or
                MSG91 or TWILIO_* (+ TWILIO_WHATSAPP_FROM)
   ============================================================= */
import "server-only";
import { log } from "@/lib/logger";
import { msg91, msg91SendSMS, msg91SendWhatsApp } from "./msg91";
import { superfone, superfoneTemplateFor, superfoneSendTemplate, superfoneSendText } from "./superfone";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const RESEND_KEY = () => env("RESEND_API_KEY");
const EMAIL_FROM = () => env("EMAIL_FROM") || "DOODLY <onboarding@resend.dev>";

const TWILIO_SID = () => env("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = () => env("TWILIO_AUTH_TOKEN");
const TWILIO_SMS_FROM = () => env("TWILIO_SMS_FROM"); // +1XXXXXXXXXX or a Messaging Service SID (MGxxxx)
const TWILIO_WA_FROM = () => env("TWILIO_WHATSAPP_FROM"); // whatsapp:+14155238886

export type SendResult = { ok: boolean; skipped?: boolean; ref?: string; error?: string };
/** A file attachment for Resend: `content` is base64-encoded bytes. */
export type EmailAttachment = { filename: string; content: string; contentType?: string };
export type EmailOptions = { attachments?: EmailAttachment[]; replyTo?: string };
/** A message to send on SMS/WhatsApp: free `text` (Twilio) + optional MSG91 template. */
export type ChannelMsg = { text: string; template?: string | null; vars?: string[] };

/** Which external channels are live right now (drives admin visibility + gating). */
export function channelStatus() {
  const email = !!RESEND_KEY();
  const twilio = !!(TWILIO_SID() && TWILIO_TOKEN());
  const sms = msg91.smsConfigured() || (twilio && !!TWILIO_SMS_FROM());
  const whatsapp = superfone.configured() || msg91.whatsappConfigured() || (twilio && !!TWILIO_WA_FROM());
  return { email, sms, whatsapp, push: false };
}

// ------------------------------------------------------------------ helpers
/** Normalise an Indian phone number to E.164 (+91…). Returns null if unusable. */
export function toE164(phone?: string | null): string | null {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, "");
  if (!p) return null;
  if (p.startsWith("+")) return p.length >= 11 ? p : null;
  if (p.length === 10) return "+91" + p;
  if (p.length === 11 && p.startsWith("0")) return "+91" + p.slice(1);
  if (p.length === 12 && p.startsWith("91")) return "+" + p;
  return "+" + p;
}

// ------------------------------------------------------------------ Email (Resend)
export async function sendEmail(to: string | null | undefined, subject: string, html: string, text: string, opts?: EmailOptions): Promise<SendResult> {
  if (!to) return { ok: false, skipped: true, error: "no-email-address" };
  const key = RESEND_KEY();
  if (!key) {
    log.warn("notify.email", "RESEND_API_KEY not set — email skipped (in-app only)", { to, subject });
    return { ok: false, skipped: true, error: "email-provider-not-configured" };
  }
  try {
    const payload: Record<string, unknown> = { from: EMAIL_FROM(), to, subject, html, text };
    if (opts?.replyTo) payload.reply_to = opts.replyTo;
    if (opts?.attachments?.length) {
      payload.attachments = opts.attachments.map((a) => ({ filename: a.filename, content: a.content, ...(a.contentType ? { content_type: a.contentType } : {}) }));
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      const reason = String(j?.message || j?.name || "").slice(0, 140);
      log.error("notify.email", "Resend rejected the message", { to, status: res.status, reason });
      return { ok: false, error: `resend-${res.status}${reason ? ":" + reason : ""}` };
    }
    return { ok: true, ref: j?.id };
  } catch (e) {
    log.error("notify.email", (e as Error)?.message ?? "send failed", { to });
    return { ok: false, error: "email-exception" };
  }
}

// ------------------------------------------------------------------ Twilio (SMS + WhatsApp share the Messages API)
async function twilioMessage(from: string, to: string, body: string): Promise<SendResult> {
  const sid = TWILIO_SID()!, token = TWILIO_TOKEN()!;
  try {
    const params = new URLSearchParams({ To: to, Body: body });
    // A Messaging Service SID (MGxxxx) uses MessagingServiceSid; a plain number uses From.
    if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
    else params.set("From", from);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
    if (!res.ok) {
      log.error("notify.twilio", "message rejected", { to, status: res.status, code: j?.code });
      return { ok: false, error: `twilio-${j?.code ?? res.status}` };
    }
    return { ok: true, ref: j?.sid };
  } catch (e) {
    log.error("notify.twilio", (e as Error)?.message ?? "send failed", { to });
    return { ok: false, error: "twilio-exception" };
  }
}

// ------------------------------------------------------------------ SMS / WhatsApp public senders
// Provider priority: MSG91 (India, DLT-compliant, template-based) → Twilio
// (free text) → skip. A `msg` may carry a template key; on MSG91 the template
// is required (DLT), while Twilio uses the free `text`.
const digitsOf = (e164: string) => e164.replace(/^\+/, "");

export async function sendSMS(phone: string | null | undefined, msg: ChannelMsg): Promise<SendResult> {
  const to = toE164(phone);
  if (!to) return { ok: false, skipped: true, error: "no-phone-number" };
  if (msg91.smsConfigured()) {
    const tpl = msg.template ? msg91.smsTemplateFor(msg.template) : null;
    if (tpl) return msg91SendSMS(digitsOf(to), tpl, msg.vars ?? []);
    // MSG91 is the SMS provider but this event has no registered template — don't
    // fall through to Twilio free text (DLT would reject); skip cleanly.
    if (!(TWILIO_SID() && TWILIO_TOKEN() && TWILIO_SMS_FROM())) {
      return { ok: false, skipped: true, error: msg.template ? `no-sms-template:${msg.template}` : "no-sms-template" };
    }
  }
  if (TWILIO_SID() && TWILIO_TOKEN() && TWILIO_SMS_FROM()) return twilioMessage(TWILIO_SMS_FROM()!, to, msg.text);
  log.warn("notify.sms", "no SMS provider configured — skipped (in-app only)", { to });
  return { ok: false, skipped: true, error: "sms-provider-not-configured" };
}

export async function sendWhatsApp(phone: string | null | undefined, msg: ChannelMsg): Promise<SendResult> {
  const to = toE164(phone);
  if (!to) return { ok: false, skipped: true, error: "no-phone-number" };
  // Superfone (Dragonfly) — preferred WhatsApp Business provider. Template events
  // send the mapped approved template (POSITIONAL vars); unmapped events fall back
  // to a session text ONLY when explicitly allowed (24h-window rule), else the
  // next provider gets a chance. Fallback-safe: a Superfone failure is returned,
  // never thrown.
  if (superfone.configured()) {
    const tpl = msg.template ? superfoneTemplateFor(msg.template) : null;
    if (tpl) return superfoneSendTemplate(digitsOf(to), tpl, msg.vars ?? []);
    if (superfone.sessionTextAllowed()) return superfoneSendText(digitsOf(to), msg.text);
    if (!msg91.whatsappConfigured() && !(TWILIO_SID() && TWILIO_TOKEN() && TWILIO_WA_FROM())) {
      return { ok: false, skipped: true, error: msg.template ? `no-whatsapp-template:${msg.template}` : "no-whatsapp-template" };
    }
  }
  if (msg91.whatsappConfigured()) {
    const tpl = msg.template ? msg91.whatsappTemplateFor(msg.template) : null;
    if (tpl) return msg91SendWhatsApp(digitsOf(to), tpl, msg.vars ?? []);
    if (!(TWILIO_SID() && TWILIO_TOKEN() && TWILIO_WA_FROM())) {
      return { ok: false, skipped: true, error: msg.template ? `no-whatsapp-template:${msg.template}` : "no-whatsapp-template" };
    }
  }
  if (TWILIO_SID() && TWILIO_TOKEN() && TWILIO_WA_FROM()) return twilioMessage(TWILIO_WA_FROM()!, "whatsapp:" + to, msg.text);
  log.warn("notify.whatsapp", "no WhatsApp provider configured — skipped (in-app only)", { to });
  return { ok: false, skipped: true, error: "whatsapp-provider-not-configured" };
}
