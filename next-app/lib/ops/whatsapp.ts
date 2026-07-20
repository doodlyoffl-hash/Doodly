/* =============================================================
   DOODLY — Operations WhatsApp (Superfone).
   One reusable sender for every ops alert, with:
     • a template REGISTRY (name + ordered variables) so a Super Admin can map
       each event to an approved Superfone template purely through the
       SUPERFONE_WA_TEMPLATES env JSON — no code change,
     • a plain-text fallback rendered from the same variables, used when no
       template is mapped (session-text must be enabled) so ops still get the
       message during template approval,
     • retry with backoff, and a per-recipient delivery record
       (recipient, message id, sent time, status, failure reason, attempts)
       that the status poller later upgrades to DELIVERED / READ.
   Superfone has no document endpoint, so PDFs travel as signed links.
   ============================================================= */
import "server-only";
import { sendWhatsApp } from "@/lib/notifications/providers";
import { superfone, superfoneTemplateFor, superfoneListTemplates, superfoneTemplateMapInfo } from "@/lib/notifications/superfone";
import { backendBase, backendBaseSource, isProtectedDeploymentHost } from "@/lib/public-url";
import { log } from "@/lib/logger";

/** Canonical ops event keys. Map each to an approved template name via
 *  SUPERFONE_WA_TEMPLATES, e.g.
 *  {"daily_delivery_summary":{"name":"daily_delivery_summary","lang":"en","header":0}} */
export const OPS_TEMPLATES = {
  daily_delivery_summary: {
    // NB: the manifest link is variable 13, NOT trailing free text. Once an event is
    // mapped to an approved template the provider sends ONLY the variables and drops
    // msg.text (lib/notifications/providers.ts) — a link appended as text would
    // silently vanish the day the template goes live.
    vars: ["date", "totalOrders", "customers", "litres", "bottles", "subscription", "oneTime", "trial", "b2b", "paid", "pending", "awaitingAssignment", "manifestLink"],
    text: (v: string[]) =>
      `🥛 DOODLY – Tomorrow's Delivery Summary\n\n` +
      `📅 Delivery Date: ${v[0]}\n\n` +
      `📦 Total Orders: ${v[1]}\n👨‍👩‍👧 Customers: ${v[2]}\n\n` +
      `🥛 Milk Quantity: ${v[3]} L\n🍼 Total Bottles: ${v[4]}\n\n` +
      `🔄 Subscription Orders: ${v[5]}\n🛒 One-Time Orders: ${v[6]}\n🧪 Trial Orders: ${v[7]}\n🏢 B2B Orders: ${v[8]}\n\n` +
      `💰 Paid Orders: ${v[9]}\n⌛ Pending Payments: ${v[10]}\n\n` +
      `🚚 Ready for Auto Assignment: ${v[11]}\n\n` +
      `📄 Full manifest: ${v[12]}\n\n` +
      `Please review today's operations in the DOODLY Admin Panel.\n\n— DOODLY Operations`,
  },
  new_order_alert: {
    vars: ["customer", "orderId", "amount"],
    text: (v: string[]) => `🛒 New Order Received\n\nCustomer: ${v[0]}\nOrder ID: ${v[1]}\nAmount: ₹${v[2]}\n\nPlease review the order in the Admin Panel.`,
  },
  auto_assignment_complete: {
    vars: ["date", "ordersAssigned", "availableExecutives"],
    text: (v: string[]) => `🚚 Auto Assignment Completed\n\nDate: ${v[0]}\n\nOrders Assigned: ${v[1]}\n\nAvailable Executives: ${v[2]}\n\nPlease review assignments in the Admin Panel.`,
  },
  packing_summary: {
    vars: ["date", "ordersReady", "litres", "bottles"],
    text: (v: string[]) => `📦 Packing Summary\n\nDelivery Date: ${v[0]}\n\nOrders Ready: ${v[1]}\n\nMilk: ${v[2]} Litres\n\nBottles: ${v[3]}\n\nPacking is ready for dispatch.`,
  },
  delivery_completed_summary: {
    vars: ["delivered", "pending", "failed"],
    text: (v: string[]) => `✅ Today's Delivery Completed\n\nDelivered Orders: ${v[0]}\n\nPending Deliveries: ${v[1]}\n\nFailed Deliveries: ${v[2]}\n\nPlease review the dashboard for details.`,
  },
  missed_delivery_alert: {
    vars: ["count"],
    text: (v: string[]) => `⚠ Attention Required\n\nThere are ${v[0]} deliveries that have not been completed.\n\nPlease review them immediately to avoid customer dissatisfaction.`,
  },
  low_inventory_alert: {
    vars: ["product", "stock"],
    text: (v: string[]) => `⚠ Inventory Alert\n\nProduct: ${v[0]}\n\nAvailable Stock: ${v[1]}\n\nPlease replenish inventory before tomorrow's dispatch.`,
  },
} as const;
export type OpsTemplateKey = keyof typeof OPS_TEMPLATES;

/** One send attempt's outcome, persisted so ops can see exactly what happened. */
export interface WaDelivery {
  to: string;
  status: "SENT" | "FAILED" | "SKIPPED" | "DELIVERED" | "READ";
  messageId: string | null;
  sentAt: string | null;
  attempts: number;
  error: string | null;
  via: "template" | "text" | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send one ops template to one number, retrying transient failures.
 *  Prefers the mapped Superfone template; falls back to plain text. */
export async function sendOpsWhatsApp(
  key: OpsTemplateKey,
  to: string,
  vars: (string | number)[],
  opts: { retries?: number; extra?: string } = {},
): Promise<WaDelivery> {
  const def = OPS_TEMPLATES[key];
  const v = vars.map((x) => String(x ?? ""));
  // Variables are POSITIONAL — a caller passing the wrong count would silently
  // render "undefined" into an approved template (and Superfone rejects a
  // template whose variable count doesn't match). Say so loudly instead.
  if (v.length !== def.vars.length) {
    log.warn("ops.whatsapp", "variable count mismatch", { key, got: v.length, expected: def.vars.length, expects: def.vars.join(",") });
  }
  const body = def.text(v) + (opts.extra ? `\n\n${opts.extra}` : "");
  const retries = Math.max(0, opts.retries ?? 2);
  const tpl = superfoneTemplateFor(key);
  const via: "template" | "text" = tpl ? "template" : "text";

  if (!superfone.configured()) {
    return { to, status: "SKIPPED", messageId: null, sentAt: null, attempts: 0, error: "WhatsApp is not configured (SUPERFONE_API_KEY unset)", via: null };
  }

  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      // providers.sendWhatsApp already prefers the mapped template and falls back
      // to session text; passing both keeps that single decision point.
      const res = await sendWhatsApp(to, { text: body, template: tpl ? key : null, vars: v });
      // NB: SendResult carries the provider message id as `ref` (not `id`) — reading
      // the wrong field would drop every wamid and break status polling.
      if (res?.ok) {
        return { to, status: "SENT", messageId: res.ref ?? null, sentAt: new Date().toISOString(), attempts: attempt, error: null, via };
      }
      lastErr = res?.error || "send failed";
      // `skipped` = a configuration/precondition problem (no number, no approved
      // template and session text disabled). Retrying cannot fix it — stop now and
      // report it honestly instead of burning attempts and calling it a failure.
      if (res?.skipped) {
        return { to, status: "SKIPPED", messageId: null, sentAt: null, attempts: attempt, error: lastErr.slice(0, 300), via };
      }
    } catch (e) {
      lastErr = (e as Error)?.message || "send threw";
    }
    if (attempt <= retries) await sleep(1000 * attempt);   // 1s, 2s backoff
  }
  log.warn("ops.whatsapp", "all attempts failed", { key, to: to.slice(-4), error: lastErr });
  return { to, status: "FAILED", messageId: null, sentAt: null, attempts: retries + 1, error: (lastErr || "unknown").slice(0, 300), via };
}

// ---------------------------------------------------------------- diagnostics
export interface TemplateCheck {
  key: OpsTemplateKey;
  label: string;
  expects: number;                                   // parameters the code sends
  mapped: { name: string; lang: string; header: number } | null;
  account: { status: string; language: string; params: number; headerParams: number } | null;
  ok: boolean;
  issue: string | null;
  fix: string | null;
}

/** Compare what the code sends against what Meta actually approved.
 *  Read-only — it lists templates, it never sends. This exists because a
 *  language mismatch (approved as en_US, mapped as en) is invisible until a
 *  real send fails with an opaque provider 500. */
export interface MappingInfo {
  set: boolean;               // SUPERFONE_WA_TEMPLATES exists in the runtime env
  valid: boolean;             // …and is parseable JSON
  keys: number;               // how many event keys it maps
  sessionText: boolean;       // SUPERFONE_ALLOW_SESSION_TEXT — the silent fallback
  note: string | null;        // plain-English reading of the above
  linkBase: string;           // where signed manifest links point
  linkSource: string;         // which env supplied it
  linkNote: string | null;    // set when recipients would hit a Vercel login page
}

export async function checkOpsTemplates(): Promise<{ configured: boolean; error?: string; mapping: MappingInfo; rows: TemplateCheck[] }> {
  const keys = Object.keys(OPS_TEMPLATES) as OpsTemplateKey[];
  const blank = (key: OpsTemplateKey, issue: string, fix: string | null = null): TemplateCheck => ({
    key, label: key.replace(/_/g, " "), expects: OPS_TEMPLATES[key].vars.length,
    mapped: null, account: null, ok: false, issue, fix,
  });

  // Read the mapping env FIRST: "unset", "invalid JSON" and "key missing" all look
  // identical from a single row ("not mapped"), and they need different fixes.
  const raw = superfoneTemplateMapInfo();
  const mapped = keys.filter((k) => raw.keys.includes(k)).length;
  // Where the manifest link points. A per-deployment Vercel host is protected,
  // so the recipient gets a Vercel login page instead of the PDF — the link is
  // generated, signed and delivered before anything reveals that.
  const linkBase = backendBase();
  const linkSource = backendBaseSource();
  const mapping: MappingInfo = {
    set: raw.set, valid: raw.valid, keys: raw.keys.length,
    sessionText: superfone.sessionTextAllowed(),
    linkBase, linkSource,
    // VERCEL_URL is ALWAYS the per-deployment host, so its use is proof on its own;
    // the host shape is a secondary check for a hand-set NEXT_PUBLIC_SITE_URL.
    linkNote: linkSource === "VERCEL_URL" || isProtectedDeploymentHost(linkBase)
      ? `Manifest links point at ${linkBase}, a per-deployment Vercel host behind Deployment Protection — recipients land on a Vercel login page instead of the PDF. Set NEXT_PUBLIC_SITE_URL on the backend project to its public URL and redeploy.`
      : linkSource === "localhost"
        ? "Manifest links point at localhost — fine in development, useless in a sent message."
        : null,
    note: !raw.set
      ? "SUPERFONE_WA_TEMPLATES is NOT set on this deployment. Add it to the backend project's environment variables and redeploy — an env change does not reach a running deployment."
      : !raw.valid
        ? "SUPERFONE_WA_TEMPLATES is set but is not valid JSON, so EVERY mapping is ignored. Re-paste it as a single line with no trailing comma."
        : mapped === 0
          ? `SUPERFONE_WA_TEMPLATES is set and valid (${raw.keys.length} key(s)) but contains none of the ops events. Check you edited the BACKEND project, not the storefront.`
          : mapped < keys.length
            ? `${mapped} of ${keys.length} ops events are mapped.`
            : null,
  };

  if (!superfone.configured()) {
    return { configured: false, error: "WhatsApp is not configured (SUPERFONE_API_KEY unset, or SUPERFONE_DISABLED=1).", mapping, rows: keys.map((k) => blank(k, "WhatsApp is not configured")) };
  }
  const list = await superfoneListTemplates();
  if (!list.ok) return { configured: true, error: list.error ?? "Could not list templates.", mapping, rows: keys.map((k) => blank(k, "Could not reach Superfone")) };

  const byName = new Map((list.templates ?? []).map((t) => [t.name, t]));
  const rows = keys.map<TemplateCheck>((key) => {
    const expects = OPS_TEMPLATES[key].vars.length;
    const mapped = superfoneTemplateFor(key);
    const label = key.replace(/_/g, " ");
    // Fall back to the event key as the template name so an unmapped-but-approved
    // template is still reported usefully instead of "not found".
    const acct = byName.get(mapped?.name ?? key) ?? null;
    const account = acct
      ? { status: acct.status, language: acct.language, params: acct.headerParams + acct.bodyParams, headerParams: acct.headerParams }
      : null;
    const base = { key, label, expects, mapped, account };

    if (!mapped) {
      return { ...base, ok: false, issue: "Not mapped in SUPERFONE_WA_TEMPLATES",
        fix: acct ? `Add "${key}":{"name":"${key}","lang":"${acct.language}","header":0}` : `Create and approve a template named ${key}, then map it.` };
    }
    if (!account) return { ...base, ok: false, issue: `No template named "${mapped.name}" in this account`, fix: "Check the name, or submit the template for approval." };
    if (String(account.status).toUpperCase() !== "APPROVED") {
      return { ...base, ok: false, issue: `Template is ${account.status}, not APPROVED`, fix: "Wait for Meta to approve it, or fix the rejection reason." };
    }
    // The one that bit us: approved in a different language than we ask for.
    if (account.language !== mapped.lang) {
      return { ...base, ok: false, issue: `Approved as ${account.language}, mapped as ${mapped.lang}`,
        fix: `Set "lang":"${account.language}" for ${key} in SUPERFONE_WA_TEMPLATES, then redeploy.` };
    }
    if (account.params !== expects) {
      return { ...base, ok: false, issue: `Approved body takes ${account.params} variable(s), the code sends ${expects}`,
        fix: `Re-submit the template with ${expects} variables, or tell your engineer the approved wording.` };
    }
    // `header` decides how many LEADING variables are sent as a header component.
    // Both directions are fatal: claiming a header the template doesn't have makes
    // Meta reject the send, and missing one leaves the header empty.
    if (mapped.header !== account.headerParams) {
      return { ...base, ok: false,
        issue: account.headerParams === 0
          ? `Mapped with header ${mapped.header}, but the approved template has no header`
          : `Mapped with header ${mapped.header}, but the approved header takes ${account.headerParams} variable(s)`,
        fix: `Set "header":${account.headerParams} for ${key} in SUPERFONE_WA_TEMPLATES, then redeploy.` };
    }
    return { ...base, ok: true, issue: null, fix: null };
  });
  return { configured: true, mapping, rows };
}

/** Fan out one ops template to every configured recipient. */
export async function broadcastOpsWhatsApp(
  key: OpsTemplateKey,
  recipients: string[],
  vars: (string | number)[],
  opts: { retries?: number; extra?: string } = {},
): Promise<WaDelivery[]> {
  const uniq = [...new Set((recipients || []).map((s) => String(s).trim()).filter(Boolean))];
  const out: WaDelivery[] = [];
  for (const to of uniq) out.push(await sendOpsWhatsApp(key, to, vars, opts));
  return out;
}
