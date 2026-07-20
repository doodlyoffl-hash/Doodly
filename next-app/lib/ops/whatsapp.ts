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
import { superfone, superfoneTemplateFor } from "@/lib/notifications/superfone";
import { log } from "@/lib/logger";

/** Canonical ops event keys. Map each to an approved template name via
 *  SUPERFONE_WA_TEMPLATES, e.g.
 *  {"daily_delivery_summary":{"name":"daily_delivery_summary","lang":"en","header":0}} */
export const OPS_TEMPLATES = {
  daily_delivery_summary: {
    vars: ["date", "totalOrders", "customers", "litres", "bottles", "subscription", "oneTime", "trial", "b2b", "paid", "pending", "awaitingAssignment"],
    text: (v: string[]) =>
      `🥛 DOODLY – Tomorrow's Delivery Summary\n\n` +
      `📅 Delivery Date: ${v[0]}\n\n` +
      `📦 Total Orders: ${v[1]}\n👨‍👩‍👧 Customers: ${v[2]}\n\n` +
      `🥛 Milk Quantity: ${v[3]} L\n🍼 Total Bottles: ${v[4]}\n\n` +
      `🔄 Subscription Orders: ${v[5]}\n🛒 One-Time Orders: ${v[6]}\n🧪 Trial Orders: ${v[7]}\n🏢 B2B Orders: ${v[8]}\n\n` +
      `💰 Paid Orders: ${v[9]}\n⌛ Pending Payments: ${v[10]}\n\n` +
      `🚚 Ready for Auto Assignment: ${v[11]}\n\n` +
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
