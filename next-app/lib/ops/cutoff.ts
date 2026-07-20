/* =============================================================
   DOODLY — Daily Operations Cut-Off engine.
   At the configured cut-off (default 20:00 IST) the day's ordering window
   closes and this prepares TOMORROW's delivery cycle so no confirmed order is
   ever missed again:
     1. bridge every confirmed order that still has no Delivery (missed-order
        protection) + roll subscription deliveries forward,
     2. build the delivery summary (totals, volume, payments, deposits, notes),
     3. flag missed/at-risk orders,
     4. notify ops/admin (email + WhatsApp + in-app),
     5. audit the run.
   Idempotent — one run per delivery day (tracked in AppSetting `ops.cutoff`).
   Reuses the Order→Delivery bridge, the subscription generator, the corrected
   volume maths, the notification layer and the audit trail. No new tables.
   ============================================================= */
import "server-only";
import type { DeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { istDayWindow } from "@/lib/delivery/stats";
import { ensureDeliveryForOrder } from "@/lib/orders/delivery-bridge";
import { audit } from "@/lib/auth/audit";
import { log } from "@/lib/logger";
import { manifestLink } from "@/lib/ops/manifest-token";
import { broadcastOpsWhatsApp, type WaDelivery } from "@/lib/ops/whatsapp";

const CFG_KEY = "ops.cutoff";
const IST_MS = 5.5 * 60 * 60 * 1000;
const CLOSED: DeliveryStatus[] = ["DELIVERED", "FAILED", "SKIPPED"];

export interface CutoffConfig {
  enabled: boolean;
  cutoffTime: string;              // "HH:MM" IST
  emailRecipients: string[];       // extra addresses beyond the admin/ops users
  notifyRoles: boolean;            // also raise an in-app alert for ADMIN/SUPER_ADMIN/OPERATIONS
  whatsappEnabled: boolean;
  whatsappRecipients: string[];    // E.164 numbers
  whatsappRetries: number;         // extra attempts per recipient on transient failure
  lastDispatch: WaDelivery[];      // delivery-confirmation log for the last summary
  lastRunDate: string | null;      // IST "YYYY-MM-DD" the cut-off last prepared (idempotency)
  lastRunAt: string | null;        // ISO timestamp of the last run
}
const DEFAULTS: CutoffConfig = {
  enabled: true, cutoffTime: "20:00", emailRecipients: [], notifyRoles: true,
  whatsappEnabled: true, whatsappRecipients: [], whatsappRetries: 2, lastDispatch: [],
  lastRunDate: null, lastRunAt: null,
};

/** Log/display numbers partially masked — an audit trail shouldn't leak full numbers. */
function maskNumber(n: string): string {
  const s = String(n || "");
  return s.length <= 4 ? s : s.slice(0, 3) + "*".repeat(Math.max(0, s.length - 7)) + s.slice(-4);
}

// ---------- config (AppSetting-backed; editable by Super Admin, no code changes) ----------
export async function getCutoffConfig(): Promise<CutoffConfig> {
  const row = await db.appSetting.findUnique({ where: { key: CFG_KEY } });
  return { ...DEFAULTS, ...((row?.value as Partial<CutoffConfig>) ?? {}) };
}
async function patchConfig(patch: Partial<CutoffConfig>, updatedBy?: string | null) {
  const cur = await getCutoffConfig();
  const next = { ...cur, ...patch };
  await db.appSetting.upsert({ where: { key: CFG_KEY }, create: { key: CFG_KEY, value: next as object, updatedBy: updatedBy ?? null }, update: { value: next as object, updatedBy: updatedBy ?? null } });
  return next;
}
export async function setCutoffConfig(patch: Partial<CutoffConfig>, actor?: { actorId?: string; actorRole?: string }) {
  const clean: Partial<CutoffConfig> = {};
  if (patch.enabled !== undefined) clean.enabled = !!patch.enabled;
  if (patch.notifyRoles !== undefined) clean.notifyRoles = !!patch.notifyRoles;
  if (patch.whatsappEnabled !== undefined) clean.whatsappEnabled = !!patch.whatsappEnabled;
  if (patch.cutoffTime !== undefined) {
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(patch.cutoffTime)) throw new Error("Cut-off time must be HH:MM (24h).");
    clean.cutoffTime = patch.cutoffTime.padStart(5, "0");
  }
  if (patch.emailRecipients !== undefined) clean.emailRecipients = (patch.emailRecipients ?? []).map((s) => String(s).trim().toLowerCase()).filter((s) => /.+@.+\..+/.test(s)).slice(0, 20);
  if (patch.whatsappRetries !== undefined) clean.whatsappRetries = Math.max(0, Math.min(5, Math.floor(Number(patch.whatsappRetries) || 0)));
  if (patch.whatsappRecipients !== undefined) clean.whatsappRecipients = (patch.whatsappRecipients ?? []).map((s) => String(s).replace(/[^\d+]/g, "")).filter(Boolean).slice(0, 20);
  const next = await patchConfig(clean, actor?.actorId);
  await audit({ userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system", action: "ops.cutoff.config", target: `${CFG_KEY} · ${JSON.stringify(clean).slice(0, 180)}` });
  return next;
}

// ---------- IST time helpers ----------
const istNow = () => new Date(Date.now() + IST_MS);
export function nextDeliveryDayIso(): string {
  const n = istNow();
  const t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1));
  return t.toISOString().slice(0, 10);
}
function istTodayIso(): string { return istNow().toISOString().slice(0, 10); }
function istMinutesNow(): number { const n = istNow(); return n.getUTCHours() * 60 + n.getUTCMinutes(); }
function cutoffMinutes(hhmm: string): number { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : 1200; }

// ---------- volume (bottles × real bottle size; matches lib/delivery/stats.ts) ----------
const normLabel = (s?: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

// ---------- summary ----------
export interface DeliverySummary {
  date: string;
  totalOrders: number;
  totalCustomers: number;
  milkLitres: number;
  totalBottles: number;
  glassBottlesRequired: number;
  subscriptionOrders: number;
  oneTimeOrders: number;
  trialOrders: number;
  b2bOrders: number;
  paymentSummary: { paid: number; pending: number; cod: number };
  pendingPayments: { count: number; amountPaise: number };
  bottleDepositsPaise: number;
  specialNotes: { customer: string; note: string }[];
  areaBreakdown: { area: string; orders: number; bottles: number }[];
}

export async function buildSummary(dateIso?: string | null): Promise<DeliverySummary> {
  const { start, end, iso } = istDayWindow(dateIso ?? nextDeliveryDayIso());
  const [rows, variants, b2bCount] = await Promise.all([
    db.delivery.findMany({
      where: { date: { gte: start, lt: end }, status: { not: "DELIVERED" } },
      select: {
        id: true, status: true, bottleCount: true, customerRemark: true,
        address: { select: { area: true, city: true, deliveryNote: true } },
        subscription: {
          select: {
            user: { select: { id: true, name: true } },
            items: { select: { qty: true, variant: { select: { ml: true } } } },
          },
        },
        order: {
          select: {
            type: true, status: true, totalPaise: true, couponDiscountPaise: true, depositPaise: true,
            user: { select: { id: true, name: true } },
            payment: { select: { method: true, status: true } },
            items: { select: { productSlug: true, variantLabel: true } },
          },
        },
      },
      orderBy: [{ slot: "asc" }, { sequence: "asc" }],
      take: 5000,
    }),
    db.variant.findMany({ select: { label: true, ml: true, product: { select: { slug: true } } } }),
    db.businessOrder.count({ where: { deliveryDate: { gte: start, lt: end }, status: { not: "CANCELLED" } } }),
  ]);

  const mlByKey = new Map<string, number>();
  for (const v of variants) if (v.product?.slug) mlByKey.set(`${v.product.slug}|${normLabel(v.label)}`, v.ml);

  const customers = new Set<string>();
  let totalMl = 0, totalBottles = 0, subscriptionOrders = 0, oneTimeOrders = 0, trialOrders = 0;
  let paid = 0, pending = 0, cod = 0, pendingCount = 0, pendingAmountPaise = 0, bottleDepositsPaise = 0;
  const specialNotes: { customer: string; note: string }[] = [];
  const areaMap = new Map<string, { orders: number; bottles: number }>();

  for (const d of rows) {
    const isSub = !!d.subscription;
    const user = d.subscription?.user ?? d.order?.user ?? null;
    if (user?.id) customers.add(user.id);
    totalBottles += d.bottleCount || 0;

    // volume for this stop
    if (isSub) {
      totalMl += (d.subscription?.items ?? []).reduce((s, i) => s + (i.variant?.ml ?? 1000) * i.qty, 0);
    } else {
      const oi = (d.order?.items ?? [])[0];
      const ml = oi ? (mlByKey.get(`${oi.productSlug}|${normLabel(oi.variantLabel)}`) ?? 1000) : 1000;
      totalMl += ml * (d.bottleCount || 1);
    }

    // order type
    if (isSub) subscriptionOrders++;
    else if (d.order?.type === "SAMPLE") trialOrders++;
    else oneTimeOrders++;

    // payments (one-time/sample orders carry a status; subscription stops are pre-paid via the sub)
    if (d.order) {
      const method = d.order.payment?.method;
      if (method === "CASH") cod++;
      else if (d.order.status === "PAID") paid++;
      else { pending++; pendingCount++; pendingAmountPaise += Math.max(0, (d.order.totalPaise || 0) - (d.order.couponDiscountPaise || 0)); }
      bottleDepositsPaise += d.order.depositPaise || 0;
    } else {
      paid++; // subscription delivery — already billed
    }

    // notes
    const note = d.customerRemark || d.address?.deliveryNote;
    if (note) specialNotes.push({ customer: user?.name ?? "—", note });

    // area breakdown
    const area = d.address?.area || d.address?.city || "Unzoned";
    const a = areaMap.get(area) ?? { orders: 0, bottles: 0 };
    a.orders++; a.bottles += d.bottleCount || 0; areaMap.set(area, a);
  }

  return {
    date: iso,
    totalOrders: rows.length,
    totalCustomers: customers.size,
    milkLitres: Math.round((totalMl / 1000) * 100) / 100,
    totalBottles,
    glassBottlesRequired: totalBottles,
    subscriptionOrders, oneTimeOrders, trialOrders, b2bOrders: b2bCount,
    paymentSummary: { paid, pending, cod },
    pendingPayments: { count: pendingCount, amountPaise: pendingAmountPaise },
    bottleDepositsPaise,
    specialNotes: specialNotes.slice(0, 50),
    areaBreakdown: [...areaMap.entries()].map(([area, v]) => ({ area, orders: v.orders, bottles: v.bottles })).sort((x, y) => y.orders - x.orders),
  };
}

// ---------- missed-order / at-risk protection ----------
export interface MissedReport {
  date: string;
  confirmedNotAssigned: number;   // SCHEDULED, no driver
  assignedNotPacked: number;      // has a driver but packing still PENDING/PACKING
  packedNotDispatched: number;    // READY/PACKED but not out yet
  overdue: number;                // a past-day stop still not closed
  ordersWithoutDelivery: number;  // a confirmed order the bridge never turned into a delivery
}
export async function missedOrderReport(dateIso?: string | null): Promise<MissedReport> {
  const { start, end, iso } = istDayWindow(dateIso ?? nextDeliveryDayIso());
  const dayIsPast = end.getTime() <= Date.now();
  const [confirmedNotAssigned, assignedNotPacked, packedNotDispatched, overdue, ordersWithoutDelivery] = await Promise.all([
    db.delivery.count({ where: { date: { gte: start, lt: end }, status: "SCHEDULED", driverId: null } }),
    db.delivery.count({ where: { date: { gte: start, lt: end }, driverId: { not: null }, packingStatus: { in: ["PENDING", "PACKING"] }, status: { notIn: [...CLOSED] } } }),
    db.delivery.count({ where: { date: { gte: start, lt: end }, packingStatus: { in: ["PACKED", "READY"] }, status: { in: ["ASSIGNED", "ACCEPTED", "PACKED"] } } }),
    dayIsPast ? db.delivery.count({ where: { date: { gte: start, lt: end }, status: { notIn: [...CLOSED] } } }) : Promise.resolve(0),
    // confirmed orders (prepaid PAID or COD) for this day that never became a delivery
    db.order.count({ where: { deliveryDate: { gte: start, lt: end }, delivery: null, OR: [{ status: "PAID" }, { payment: { method: "CASH" } }] } }),
  ]);
  return { date: iso, confirmedNotAssigned, assignedNotPacked, packedNotDispatched, overdue, ordersWithoutDelivery };
}

/** Bridge every confirmed order for the day that still has no delivery, and roll the
    subscription horizon forward. This is the core "no order forgotten" guarantee. */
async function prepareDeliveries(start: Date, end: Date): Promise<{ bridged: number; subCreated: number }> {
  const orphans = await db.order.findMany({
    where: { deliveryDate: { gte: start, lt: end }, delivery: null, OR: [{ status: "PAID" }, { payment: { method: "CASH" } }] },
    select: { id: true },
  });
  let bridged = 0;
  for (const o of orphans) { try { const r = await ensureDeliveryForOrder(o.id); if (r?.created) bridged++; } catch (e) { log.error("ops.cutoff", "bridge failed", { orderId: o.id, err: (e as Error)?.message }); } }
  let subCreated = 0;
  try { const { generateUpcomingDeliveries } = await import("@/lib/subscriptions/deliveries"); subCreated = (await generateUpcomingDeliveries()).created ?? 0; } catch { /* non-blocking */ }
  return { bridged, subCreated };
}

// ---------- the cut-off run ----------
export interface CutoffResult {
  ok: boolean;
  skipped?: string;
  date: string;
  prepared?: { bridged: number; subCreated: number };
  summary: DeliverySummary;
  missed: MissedReport;
  notified?: { emails: number; whatsapp: number; adminsAlerted: boolean };
}

export async function runDailyCutoff(opts: { force?: boolean; date?: string; actor?: { actorId?: string; actorRole?: string } } = {}): Promise<CutoffResult> {
  const cfg = await getCutoffConfig();
  const target = opts.date ?? nextDeliveryDayIso();
  const { start, end } = istDayWindow(target);

  if (!cfg.enabled && !opts.force) {
    return { ok: false, skipped: "disabled", date: target, summary: await buildSummary(target), missed: await missedOrderReport(target) };
  }
  if (cfg.lastRunDate === target && !opts.force) {
    return { ok: true, skipped: "already_run", date: target, summary: await buildSummary(target), missed: await missedOrderReport(target) };
  }

  const prepared = await prepareDeliveries(start, end);
  const summary = await buildSummary(target);
  const missed = await missedOrderReport(target);

  let notified: { emails: number; whatsapp: number; adminsAlerted: boolean; waLog: WaDelivery[] } = { emails: 0, whatsapp: 0, adminsAlerted: false, waLog: [] };
  try { notified = await dispatchNotifications(cfg, summary, missed); } catch (e) { log.error("ops.cutoff", "notify failed", { err: (e as Error)?.message }); }

  // Persist the per-recipient delivery-confirmation log alongside the idempotency marker,
  // so the status poller can upgrade SENT → DELIVERED/READ and admins can see failures.
  await patchConfig({ lastRunDate: target, lastRunAt: new Date().toISOString(), lastDispatch: notified.waLog }, opts.actor?.actorId);
  await audit({
    userId: opts.actor?.actorId ?? null, actorRole: opts.actor?.actorRole ?? "system",
    action: "ops.cutoff.run",
    target: `${target} · ${summary.totalOrders} orders · ${summary.totalBottles} bottles · ${summary.milkLitres}L · bridged ${prepared.bridged} · unassigned ${missed.confirmedNotAssigned} · emails ${notified.emails} · wa ${notified.whatsapp}`,
  });

  return { ok: true, date: target, prepared, summary, missed, notified };
}

/** Fire the cut-off automatically when it's due and hasn't run for tomorrow yet.
    Called lazily (admin dashboard load after the cut-off time) and as a safety
    net from the daily cron — so it works on any Vercel plan. Idempotent. */
export async function maybeRunCutoff(opts: { source?: string } = {}): Promise<{ ran: boolean; reason: string; date: string }> {
  const cfg = await getCutoffConfig();
  const target = nextDeliveryDayIso();
  if (!cfg.enabled) return { ran: false, reason: "disabled", date: target };
  if (cfg.lastRunDate === target) return { ran: false, reason: "already_run", date: target };
  // Due once the IST clock passes the cut-off (the cron safety-net at 07:30 IST also passes this,
  // catching up any evening that no admin logged in). Before cut-off on the same day → not yet.
  const due = istMinutesNow() >= cutoffMinutes(cfg.cutoffTime) || istTodayIso() === target;
  if (!due) return { ran: false, reason: "before_cutoff", date: target };
  const r = await runDailyCutoff({ actor: { actorRole: opts.source ?? "system" } });
  return { ran: r.ok && !r.skipped, reason: r.skipped ?? "ran", date: target };
}

/** Send a test summary to the configured WhatsApp recipients (Admin Settings →
 *  "Test WhatsApp Summary"). Uses the SAME template + real data as the nightly run,
 *  so what ops see here is exactly what they'll get — but changes nothing. */
export async function sendTestWhatsAppSummary(actor?: { actorId?: string; actorRole?: string }) {
  const cfg = await getCutoffConfig();
  const recipients = cfg.whatsappRecipients ?? [];
  if (!recipients.length) throw new Error("Add at least one WhatsApp recipient first.");
  const target = nextDeliveryDayIso();
  const [s, m] = await Promise.all([buildSummary(target), missedOrderReport(target)]);
  const dmy = s.date.split("-").reverse().join("/");
  const link = await manifestLink(s.date);
  const results = await broadcastOpsWhatsApp("daily_delivery_summary", recipients, [
    dmy, s.totalOrders, s.totalCustomers, s.milkLitres, s.totalBottles,
    s.subscriptionOrders, s.oneTimeOrders, s.trialOrders, s.b2bOrders,
    s.paymentSummary.paid, s.pendingPayments.count, m.confirmedNotAssigned,
  ], { retries: Math.max(0, cfg.whatsappRetries ?? 2), extra: (link ? `📄 Full manifest:\n${link}\n` : "") + "(This is a TEST from the DOODLY Admin Panel.)" });
  await audit({
    userId: actor?.actorId ?? null, actorRole: actor?.actorRole ?? "system",
    action: "ops.whatsapp.test",
    target: `${s.date} · ${results.filter((r) => r.status === "SENT").length}/${results.length} sent`,
  }).catch(() => {});
  return { date: s.date, results };
}

/** Refresh the delivery status of the last summary's WhatsApp messages
 *  (SENT → DELIVERED → READ, or FAILED). Superfone exposes status by message id;
 *  there are no webhooks, so this polls. Called from the daily cron. */
export async function pollCutoffWhatsAppStatuses(): Promise<{ polled: number; updated: number }> {
  const cfg = await getCutoffConfig();
  const dispatch = cfg.lastDispatch ?? [];
  const pending = dispatch.filter((d) => d.messageId && (d.status === "SENT" || d.status === "DELIVERED"));
  if (!pending.length) return { polled: 0, updated: 0 };

  const { superfone, superfoneGetMessage } = await import("@/lib/notifications/superfone");
  if (!superfone.configured()) return { polled: 0, updated: 0 };

  let updated = 0;
  const next = [...dispatch];
  for (const d of pending) {
    try {
      const r = await superfoneGetMessage(d.messageId!);
      if (!r.ok || !r.status) continue;
      const s = r.status.toLowerCase();
      const mapped: WaDelivery["status"] | null = s === "read" ? "READ" : s === "delivered" ? "DELIVERED" : s === "failed" ? "FAILED" : null;
      if (!mapped || mapped === d.status) continue;
      const i = next.findIndex((x) => x.messageId === d.messageId);
      if (i >= 0) {
        next[i] = { ...next[i], status: mapped, error: s === "failed" ? JSON.stringify((r.statuses ?? []).flatMap((x) => x.errors ?? []).slice(0, 2)).slice(0, 300) : next[i].error };
        updated++;
      }
    } catch { /* per-message */ }
  }
  if (updated) await patchConfig({ lastDispatch: next });
  return { polled: pending.length, updated };
}

/** Dashboard status (Step 5): has tomorrow been prepared? + the summary + risks. */
export async function getCutoffStatus() {
  const cfg = await getCutoffConfig();
  const target = nextDeliveryDayIso();
  const [summary, missed, manifestUrl] = await Promise.all([buildSummary(target), missedOrderReport(target), manifestLink(target)]);
  return {
    date: target,
    ready: cfg.lastRunDate === target,
    lastRunAt: cfg.lastRunAt,
    cutoffTime: cfg.cutoffTime,
    enabled: cfg.enabled,
    pastCutoff: istMinutesNow() >= cutoffMinutes(cfg.cutoffTime),
    summary,
    missed,
    // delivery-confirmation log for the last summary (masked numbers)
    dispatch: (cfg.lastDispatch ?? []).map((d) => ({ ...d, to: maskNumber(d.to) })),
    // the same signed link the WhatsApp/email summary carries (share-safe, expires)
    manifestUrl,
  };
}

// ---------- notifications ----------
async function dispatchNotifications(cfg: CutoffConfig, s: DeliverySummary, m: MissedReport) {
  const dmy = s.date.split("-").reverse().join("/");
  let emails = 0, whatsapp = 0, adminsAlerted = false;

  // recipients = configured extras + every active ADMIN / SUPER_ADMIN / OPERATIONS user with an email
  const staff = await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN", "OPERATIONS"] }, status: "ACTIVE", email: { not: null } }, select: { email: true } });
  const to = [...new Set([...(cfg.emailRecipients ?? []), ...staff.map((u) => u.email!).filter(Boolean)])];

  try {
    const { sendOpsDailySummary } = await import("@/lib/auth/email");
    for (const addr of to) { try { await sendOpsDailySummary(addr, { dmy, summary: s, missed: m }); emails++; } catch { /* per-recipient */ } }
  } catch (e) { log.error("ops.cutoff", "email send failed", { err: (e as Error)?.message }); }

  // ---- WhatsApp summary (Superfone) + signed manifest link ----
  // Superfone has no document endpoint, so the detailed manifest PDF travels as a
  // short-lived signed link rather than an attachment. Each recipient's outcome is
  // recorded (id / status / attempts / error) for the delivery-confirmation log.
  let waLog: WaDelivery[] = [];
  if (cfg.whatsappEnabled && (cfg.whatsappRecipients?.length ?? 0)) {
    try {
      const link = await manifestLink(s.date);
      const vars = [
        dmy, s.totalOrders, s.totalCustomers, s.milkLitres, s.totalBottles,
        s.subscriptionOrders, s.oneTimeOrders, s.trialOrders, s.b2bOrders,
        s.paymentSummary.paid, s.pendingPayments.count, m.confirmedNotAssigned,
      ];
      waLog = await broadcastOpsWhatsApp("daily_delivery_summary", cfg.whatsappRecipients, vars, {
        retries: Math.max(0, cfg.whatsappRetries ?? 2),
        extra: link ? `📄 Full manifest (customers, addresses, notes):\n${link}\n(link expires in 3 days)` : undefined,
      });
      whatsapp = waLog.filter((x) => x.status === "SENT").length;
    } catch (e) { log.error("ops.cutoff", "whatsapp send failed", { err: (e as Error)?.message }); }

    // Never fail silently: if EVERY recipient failed, escalate to the admins in-app.
    const failed = waLog.filter((x) => x.status === "FAILED" || x.status === "SKIPPED");
    if (waLog.length && failed.length === waLog.length) {
      try {
        const { notifyAdmins } = await import("@/lib/assignment/notify");
        await notifyAdmins(db, "⚠ WhatsApp summary could not be delivered",
          `Tomorrow's delivery summary (${dmy}) failed to reach all ${waLog.length} WhatsApp recipient(s): ${failed[0].error ?? "unknown"}. The email summary and the Admin Panel are unaffected.`, "PUSH");
      } catch { /* non-blocking */ }
    }
    for (const d of waLog) {
      await audit({
        actorRole: "system",
        action: d.status === "SENT" ? "ops.whatsapp.sent" : "ops.whatsapp.failed",
        target: `${s.date} · ${maskNumber(d.to)} · ${d.status}${d.messageId ? " · " + d.messageId : ""} · attempts ${d.attempts}${d.error ? " · " + d.error : ""}`,
      }).catch(() => { /* audit must never block a send */ });
    }
  }

  // in-app alert for ops/admin
  if (cfg.notifyRoles) {
    try {
      const { notifyAdmins } = await import("@/lib/assignment/notify");
      const title = "Tomorrow's deliveries are ready";
      const body = `${s.totalOrders} order(s), ${s.totalBottles} bottle(s), ${s.milkLitres} L for ${dmy}.` + (m.confirmedNotAssigned ? ` ${m.confirmedNotAssigned} still need assignment.` : "");
      await notifyAdmins(db, title, body, "PUSH");
      adminsAlerted = true;
    } catch (e) { log.error("ops.cutoff", "admin alert failed", { err: (e as Error)?.message }); }
  }

  // escalation (Step 10): unassigned confirmed orders after cut-off → alert ops/admin explicitly
  if (m.confirmedNotAssigned > 0 && cfg.notifyRoles) {
    try {
      const { notifyAdmins } = await import("@/lib/assignment/notify");
      await notifyAdmins(db, "⚠ Orders awaiting assignment", `${m.confirmedNotAssigned} confirmed order(s) for ${dmy} are not assigned to any executive. Run Auto Assignment.`, "PUSH");
    } catch { /* non-blocking */ }
  }

  return { emails, whatsapp, adminsAlerted, waLog };
}
