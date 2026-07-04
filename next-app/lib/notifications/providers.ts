/* =============================================================
   DOODLY — Notification provider dispatch (SMS / WhatsApp / Email)
   Low-level senders for the real external channels. Every sender is
   FALLBACK-SAFE: with no provider key it logs + returns skipped,
   never throws, so notifications degrade to in-app only and nothing
   in the request path breaks. Keys live ONLY in server env (Vercel):
     Email    → RESEND_API_KEY            (+ EMAIL_FROM)
     SMS      → TWILIO_* (+ TWILIO_SMS_FROM) or MSG91_AUTH_KEY (+ MSG91_SENDER_ID)
     WhatsApp → TWILIO_* (+ TWILIO_WHATSAPP_FROM)
   ============================================================= */
import "server-only";
import { log } from "@/lib/logger";

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

const MSG91_KEY = () => env("MSG91_AUTH_KEY");
const MSG91_SENDER = () => env("MSG91_SENDER_ID");
const MSG91_ROUTE = () => env("MSG91_ROUTE") || "4"; // 4 = transactional

export type SendResult = { ok: boolean; skipped?: boolean; ref?: string; error?: string };

/** Which external channels are live right now (drives admin visibility + gating). */
export function channelStatus() {
  const email = !!RESEND_KEY();
  const twilio = !!(TWILIO_SID() && TWILIO_TOKEN());
  const sms = (twilio && !!TWILIO_SMS_FROM()) || !!(MSG91_KEY() && MSG91_SENDER());
  const whatsapp = twilio && !!TWILIO_WA_FROM();
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
export async function sendEmail(to: string | null | undefined, subject: string, html: string, text: string): Promise<SendResult> {
  if (!to) return { ok: false, skipped: true, error: "no-email-address" };
  const key = RESEND_KEY();
  if (!key) {
    log.warn("notify.email", "RESEND_API_KEY not set — email skipped (in-app only)", { to, subject });
    return { ok: false, skipped: true, error: "email-provider-not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM(), to, subject, html, text }),
    });
    if (!res.ok) {
      log.error("notify.email", "Resend rejected the message", { to, status: res.status });
      return { ok: false, error: `resend-${res.status}` };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
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

// ------------------------------------------------------------------ MSG91 (optional India SMS fallback)
async function msg91SMS(digits: string, text: string): Promise<SendResult> {
  const key = MSG91_KEY()!, sender = MSG91_SENDER()!;
  try {
    const url = new URL("https://api.msg91.com/api/sendhttp.php");
    url.searchParams.set("authkey", key);
    url.searchParams.set("mobiles", digits);
    url.searchParams.set("message", text);
    url.searchParams.set("sender", sender);
    url.searchParams.set("route", MSG91_ROUTE()!);
    url.searchParams.set("country", "91");
    const res = await fetch(url.toString(), { method: "GET" });
    const b = await res.text().catch(() => "");
    if (!res.ok || /error/i.test(b)) {
      log.error("notify.msg91", "SMS rejected", { status: res.status, body: b.slice(0, 120) });
      return { ok: false, error: `msg91-${res.status}` };
    }
    return { ok: true, ref: b.slice(0, 60) || undefined };
  } catch (e) {
    log.error("notify.msg91", (e as Error)?.message ?? "send failed", {});
    return { ok: false, error: "msg91-exception" };
  }
}

// ------------------------------------------------------------------ SMS / WhatsApp public senders
export async function sendSMS(phone: string | null | undefined, text: string): Promise<SendResult> {
  const to = toE164(phone);
  if (!to) return { ok: false, skipped: true, error: "no-phone-number" };
  if (TWILIO_SID() && TWILIO_TOKEN() && TWILIO_SMS_FROM()) return twilioMessage(TWILIO_SMS_FROM()!, to, text);
  if (MSG91_KEY() && MSG91_SENDER()) return msg91SMS(to.replace(/^\+/, ""), text);
  log.warn("notify.sms", "no SMS provider configured — skipped (in-app only)", { to });
  return { ok: false, skipped: true, error: "sms-provider-not-configured" };
}

export async function sendWhatsApp(phone: string | null | undefined, text: string): Promise<SendResult> {
  const to = toE164(phone);
  if (!to) return { ok: false, skipped: true, error: "no-phone-number" };
  if (TWILIO_SID() && TWILIO_TOKEN() && TWILIO_WA_FROM()) return twilioMessage(TWILIO_WA_FROM()!, "whatsapp:" + to, text);
  log.warn("notify.whatsapp", "no WhatsApp provider configured — skipped (in-app only)", { to });
  return { ok: false, skipped: true, error: "whatsapp-provider-not-configured" };
}
