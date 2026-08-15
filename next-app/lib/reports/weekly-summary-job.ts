/* =============================================================
   DOODLY — Weekly business-summary delivery + weekly trigger.
   Resolves recipients (active ADMIN/SUPER_ADMIN/OPERATIONS + any configured
   extras — the same pattern the ops cut-off email uses), renders the branded
   weekly email and sends it via Resend. maybeSendWeeklySummary() is called from
   the DAILY notifications cron and fires ONCE per week (on the configured send
   day, guarded by an AppSetting marker) — so we add NO new Vercel cron (the Hobby
   2-cron cap is already used). Config lives in AppSetting "reports.weekly".
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { weeklySummary, toEmailData, type WeeklySummary } from "@/lib/reports/weekly-summary";
import { sendWeeklySummary } from "@/lib/auth/email";

const KEY = "reports.weekly";
const IST_MS = 5.5 * 60 * 60 * 1000;

export interface WeeklyReportConfig {
  enabled: boolean;        // master switch for the scheduled send
  sendDay: number;         // IST weekday to send: 0=Sun … 1=Mon (default) … 6=Sat
  recipients: string[];    // extra recipient emails (on top of the admin/ops staff list)
  lastRunWeek: string | null;   // IST date of the last scheduled send (idempotency marker)
}

export async function getWeeklyConfig(): Promise<WeeklyReportConfig> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<WeeklyReportConfig>;
  return {
    enabled: v.enabled !== false,
    sendDay: typeof v.sendDay === "number" && v.sendDay >= 0 && v.sendDay <= 6 ? v.sendDay : 1,
    recipients: Array.isArray(v.recipients) ? v.recipients.filter((e) => typeof e === "string") : [],
    lastRunWeek: typeof v.lastRunWeek === "string" ? v.lastRunWeek : null,
  };
}
export async function patchWeeklyConfig(patch: Partial<WeeklyReportConfig>): Promise<WeeklyReportConfig> {
  const next = { ...(await getWeeklyConfig()), ...patch };
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as object }, update: { value: next as object } });
  return next;
}

/** Owner/admin recipients = active ADMIN/SUPER_ADMIN/OPERATIONS staff + configured extras. */
async function resolveRecipients(cfg: WeeklyReportConfig): Promise<string[]> {
  const staff = await db.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN", "OPERATIONS"] }, status: "ACTIVE", email: { not: null } },
    select: { email: true },
  }).catch(() => [] as { email: string | null }[]);
  const emails = [...(cfg.recipients || []), ...staff.map((u) => u.email).filter((e): e is string => !!e)];
  return [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
}

/** Compute the week + send the branded email to every recipient. Returns counts. Never throws. */
export async function deliverWeeklySummary(opts: { anchorIso?: string } = {}): Promise<{ sent: number; recipients: string[]; summary: WeeklySummary }> {
  const cfg = await getWeeklyConfig();
  const summary = await weeklySummary(opts.anchorIso);
  const to = await resolveRecipients(cfg);
  const data = toEmailData(summary);
  let sent = 0;
  for (const email of to) {
    try { const r = await sendWeeklySummary(email, data); if ((r as { delivered?: boolean }).delivered) sent++; }
    catch { /* one bad recipient never blocks the rest */ }
  }
  return { sent, recipients: to, summary };
}

/** Called from the daily notifications cron. Sends exactly once per week on the configured
 *  IST send day (guarded by the lastRunWeek marker so a re-run same day never double-sends). */
export async function maybeSendWeeklySummary(): Promise<{ ran: boolean; reason?: string; sent?: number; recipients?: number }> {
  const cfg = await getWeeklyConfig();
  if (!cfg.enabled) return { ran: false, reason: "disabled" };
  const nowIst = new Date(Date.now() + IST_MS);
  if (nowIst.getUTCDay() !== cfg.sendDay) return { ran: false, reason: "not-send-day" };
  const weekKey = nowIst.toISOString().slice(0, 10);   // the IST date of this send day
  if (cfg.lastRunWeek === weekKey) return { ran: false, reason: "already-sent" };
  const res = await deliverWeeklySummary();
  await patchWeeklyConfig({ lastRunWeek: weekKey });
  return { ran: true, sent: res.sent, recipients: res.recipients.length };
}
