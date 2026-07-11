/* =============================================================
   DOODLY — Superfone "Dragonfly" WhatsApp Business API client.
   Official docs: https://documenter.getpostman.com/view/36618308/2sB2j7e9sW

   Auth      : x-api-key header (Superfone dashboard → Teams → Settings).
   Base URL  : https://prod-api.superfone.co.in/superfone/api/dragonfly
               (production; no sandbox is documented).
   Endpoints : POST /whatsapp/messages                  (template + session text)
               GET  /whatsapp/messages/{wamid}          (delivery status — PULL;
                                                         no webhooks documented)
               GET  /whatsapp/message_templates[/{id}]  (approved templates)
   Recipient : E.164 digits WITHOUT "+", e.g. 91XXXXXXXXXX.
   Templates : Meta-approved, POSITIONAL {{1}} params sent as body components.

   Safety: fallback-safe (never throws into callers), 10s timeout, one retry
   with backoff on 429/5xx, the API key is never logged. Configure ONLY via
   server env:
     SUPERFONE_API_KEY        — the x-api-key (required to enable)
     SUPERFONE_BASE_URL       — override base (defaults to documented prod)
     SUPERFONE_WA_TEMPLATES   — JSON map of DOODLY event keys → Superfone
                                template names, e.g.
                                {"order_confirmed":"doodly_order_confirmed",
                                 "delivered":{"name":"doodly_delivered","lang":"en"}}
     SUPERFONE_DEFAULT_LANG   — template language when unmapped (default "en")
     SUPERFONE_DISABLED       — "1" = admin kill-switch without removing the key
     SUPERFONE_ALLOW_SESSION_TEXT — "1" = allow free-text sends (only delivers
                                inside WhatsApp's 24h customer-service window)
   ============================================================= */
import "server-only";
import { log } from "@/lib/logger";
import type { SendResult } from "./providers";

const env = (k: string) => { const v = process.env[k]; return v && v.trim() ? v.trim() : undefined; };
const API_KEY = () => env("SUPERFONE_API_KEY");
const BASE = () => env("SUPERFONE_BASE_URL") || "https://prod-api.superfone.co.in/superfone/api/dragonfly";
const DEFAULT_LANG = () => env("SUPERFONE_DEFAULT_LANG") || "en";

export const superfone = {
  configured: () => !!API_KEY() && env("SUPERFONE_DISABLED") !== "1",
  sessionTextAllowed: () => env("SUPERFONE_ALLOW_SESSION_TEXT") === "1",
};

/** Resolve a DOODLY event key (e.g. "order_confirmed") to a Superfone template.
    `header` = how many LEADING vars fill the header component; the rest fill the
    body (each component's params are positional within that component). */
export function superfoneTemplateFor(key: string): { name: string; lang: string; header: number } | null {
  try {
    const raw = env("SUPERFONE_WA_TEMPLATES");
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string | { name: string; lang?: string; header?: number }>;
    const v = map[key];
    if (!v) return null;
    if (typeof v === "string") return { name: v, lang: DEFAULT_LANG(), header: 0 };
    return v.name ? { name: v.name, lang: v.lang || DEFAULT_LANG(), header: Math.max(0, Math.min(3, v.header ?? 0)) } : null;
  } catch {
    log.warn("superfone", "SUPERFONE_WA_TEMPLATES is not valid JSON — template mapping disabled");
    return null;
  }
}

/** One documented call with timeout + a single backoff retry on 429/5xx. Never throws. */
async function call(method: "GET" | "POST", path: string, body?: unknown, attempt = 0): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(BASE() + path, {
      method,
      headers: { "x-api-key": API_KEY()!, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      await new Promise((r) => setTimeout(r, res.status === 429 ? 1200 : 400));
      return call(method, path, body, attempt + 1);
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    if (attempt < 1) { await new Promise((r) => setTimeout(r, 400)); return call(method, path, body, attempt + 1); }
    return { ok: false, status: 0, json: { error: (e as Error)?.name === "AbortError" ? "timeout" : "network" } };
  } finally { clearTimeout(timer); }
}

/** Pull the wamid out of the documented success envelope. */
function wamidOf(json: Record<string, unknown>): string | undefined {
  const data = json?.data as { messages?: { id?: string }[] } | undefined;
  return data?.messages?.[0]?.id;
}
/** Superfone can return HTTP 200 "success" with a failure INSIDE data (e.g.
    {reason:"INSUFFICIENT_BALANCE"}). A send without a wamid is NOT a success. */
function innerFailure(json: Record<string, unknown>): string | null {
  const data = json?.data as { reason?: string; message?: string } | undefined;
  if (data?.reason || (data?.message && !wamidOf(json))) {
    return `superfone:${(data.reason || data.message || "no-message-id").slice(0, 80)}`;
  }
  return wamidOf(json) ? null : "superfone:no-message-id";
}
function errorOf(json: Record<string, unknown>, status: number): string {
  const msg = String((json as { message?: string; error?: string })?.message || (json as { error?: string })?.error || "").slice(0, 120);
  return `superfone-${status || "net"}${msg && msg !== "success" ? ":" + msg : ""}`;
}

/** Send an approved template message. The first `tpl.header` vars fill the header
    component; the remaining vars fill the POSITIONAL body {{1}}..{{n}}. */
export async function superfoneSendTemplate(recipientDigits: string, tpl: { name: string; lang: string; header?: number }, vars: string[] = []): Promise<SendResult> {
  const param = (v: string) => ({ type: "text", text: String(v).slice(0, 300) });
  const h = Math.max(0, Math.min(tpl.header ?? 0, vars.length));
  const components: unknown[] = [];
  if (h > 0) components.push({ type: "header", parameters: vars.slice(0, h).map(param) });
  if (vars.length > h) components.push({ type: "body", parameters: vars.slice(h).map(param) });
  const r = await call("POST", "/whatsapp/messages", {
    type: "template", recipient: recipientDigits, templateName: tpl.name, language: tpl.lang, components,
  });
  if (!r.ok) {
    log.error("superfone", "template send rejected", { to: recipientDigits.slice(-4), template: tpl.name, status: r.status });
    return { ok: false, error: errorOf(r.json, r.status) };
  }
  const fail = innerFailure(r.json);
  if (fail) {
    log.error("superfone", "template send failed (200 envelope)", { to: recipientDigits.slice(-4), template: tpl.name, reason: fail });
    return { ok: false, error: fail };
  }
  return { ok: true, ref: wamidOf(r.json) };
}

/** Send a free-text (session) message — delivers only within the 24h window. */
export async function superfoneSendText(recipientDigits: string, text: string): Promise<SendResult> {
  const r = await call("POST", "/whatsapp/messages", { type: "text", recipient: recipientDigits, message: { body: text.slice(0, 4096) } });
  if (!r.ok) {
    log.error("superfone", "text send rejected", { to: recipientDigits.slice(-4), status: r.status });
    return { ok: false, error: errorOf(r.json, r.status) };
  }
  const fail = innerFailure(r.json);
  if (fail) {
    log.error("superfone", "text send failed (200 envelope)", { to: recipientDigits.slice(-4), reason: fail });
    return { ok: false, error: fail };
  }
  return { ok: true, ref: wamidOf(r.json) };
}

export type SuperfoneStatus = { status: string; timestamp?: string; errors?: unknown[] };
/** Delivery status for a sent message (accepted → sent → delivered → read | failed). */
export async function superfoneGetMessage(wamid: string): Promise<{ ok: boolean; status?: string; statuses?: SuperfoneStatus[]; error?: string }> {
  const r = await call("GET", "/whatsapp/messages/" + encodeURIComponent(wamid));
  if (!r.ok) return { ok: false, error: errorOf(r.json, r.status) };
  const d = r.json?.data as { status?: string; statuses?: SuperfoneStatus[] } | undefined;
  return { ok: true, status: d?.status, statuses: d?.statuses };
}

/** List the account's WhatsApp templates (verify names/language/APPROVED status). */
export async function superfoneListTemplates(): Promise<{ ok: boolean; templates?: { name: string; status: string; language: string; category?: string }[]; error?: string }> {
  const r = await call("GET", "/whatsapp/message_templates");
  if (!r.ok) return { ok: false, error: errorOf(r.json, r.status) };
  const outer = r.json?.data as { data?: { name: string; status: string; language: string; category?: string }[] } | undefined;
  const list = outer?.data ?? [];
  return { ok: true, templates: list.map((t) => ({ name: t.name, status: t.status, language: t.language, category: t.category })) };
}
