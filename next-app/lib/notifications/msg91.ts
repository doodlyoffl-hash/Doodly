/* =============================================================
   DOODLY — MSG91 provider (India: DLT SMS + WhatsApp Business API).
   Template-driven + env-configured + FALLBACK-SAFE (no key / no
   template → returns skipped, never throws).

   Env (server-only, set in Vercel):
     MSG91_AUTH_KEY               the account auth key
     MSG91_SMS_TEMPLATES          JSON { eventKey: dltFlowTemplateId }
     MSG91_WHATSAPP_NUMBER        integrated WhatsApp number, digits only (e.g. 919876543210)
     MSG91_WHATSAPP_TEMPLATES     JSON { eventKey: approvedTemplateName }
     MSG91_WHATSAPP_LANG          template language code (default "en")

   India transactional SMS is DLT-regulated: you can't send free text,
   only pre-approved templates with {#var#} slots. So each event maps to
   a template id (SMS) / template name (WhatsApp) + ordered variables.
   See docs/MSG91-SETUP.md for the exact templates to register.
   ============================================================= */
import "server-only";
import { log } from "@/lib/logger";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const KEY = () => env("MSG91_AUTH_KEY");
const WA_NUMBER = () => env("MSG91_WHATSAPP_NUMBER");
const WA_LANG = () => env("MSG91_WHATSAPP_LANG") || "en";

function jsonMap(name: string): Record<string, string> {
  try {
    const v = env(name);
    if (!v) return {};
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    log.warn("notify.msg91", `${name} is not valid JSON — ignoring`, {});
    return {};
  }
}

export type Msg91Result = { ok: boolean; skipped?: boolean; ref?: string; error?: string };

/** Coarse availability (a key is present). Per-message send still needs a template. */
export const msg91 = {
  smsConfigured: () => !!KEY(),
  whatsappConfigured: () => !!(KEY() && WA_NUMBER()),
  smsTemplateFor: (eventKey: string): string | null => jsonMap("MSG91_SMS_TEMPLATES")[eventKey] || null,
  whatsappTemplateFor: (eventKey: string): string | null => jsonMap("MSG91_WHATSAPP_TEMPLATES")[eventKey] || null,
};

/** Digits should be 91XXXXXXXXXX (country code, no +). */
export async function msg91SendSMS(digits: string, templateId: string | null, vars: string[] = []): Promise<Msg91Result> {
  const key = KEY();
  if (!key) return { ok: false, skipped: true, error: "msg91-not-configured" };
  if (!templateId) return { ok: false, skipped: true, error: "no-sms-template" };
  // Flow API recipient: variables map to var1, var2, … (name your DLT/flow variables the same, in order).
  const recipient: Record<string, string> = { mobiles: digits };
  vars.forEach((v, i) => { recipient[`var${i + 1}`] = String(v ?? ""); });
  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [recipient] }),
    });
    const j = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || j?.type === "error") {
      log.error("notify.msg91.sms", "SMS rejected", { status: res.status, msg: j?.message });
      return { ok: false, error: `msg91-sms-${j?.message || res.status}` };
    }
    return { ok: true, ref: typeof j?.message === "string" ? j.message.slice(0, 60) : undefined };
  } catch (e) {
    log.error("notify.msg91.sms", (e as Error)?.message ?? "send failed", {});
    return { ok: false, error: "msg91-sms-exception" };
  }
}

/** Digits should be 91XXXXXXXXXX (country code, no +). vars → body_1, body_2, … ({{1}}, {{2}} in the template). */
export async function msg91SendWhatsApp(digits: string, templateName: string | null, vars: string[] = [], lang?: string): Promise<Msg91Result> {
  const key = KEY(), num = WA_NUMBER();
  if (!key || !num) return { ok: false, skipped: true, error: "msg91-whatsapp-not-configured" };
  if (!templateName) return { ok: false, skipped: true, error: "no-whatsapp-template" };
  const components: Record<string, { type: string; value: string }> = {};
  vars.forEach((v, i) => { components[`body_${i + 1}`] = { type: "text", value: String(v ?? "") }; });
  try {
    const res = await fetch("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
      method: "POST",
      headers: { authkey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        integrated_number: num,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: templateName,
            language: { code: lang || WA_LANG(), policy: "deterministic" },
            to_and_components: [{ to: [digits], components }],
          },
        },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { type?: string; hasError?: boolean; message?: string; request_id?: string; data?: Array<{ requestId?: string }> };
    if (!res.ok || j?.type === "error" || j?.hasError) {
      log.error("notify.msg91.wa", "WhatsApp rejected", { status: res.status, msg: j?.message });
      return { ok: false, error: `msg91-wa-${res.status}` };
    }
    return { ok: true, ref: j?.request_id || j?.data?.[0]?.requestId || undefined };
  } catch (e) {
    log.error("notify.msg91.wa", (e as Error)?.message ?? "send failed", {});
    return { ok: false, error: "msg91-wa-exception" };
  }
}
