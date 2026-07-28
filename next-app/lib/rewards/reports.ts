/* =============================================================
   DOODLY — Reward reports & analytics
   analytics(): headline KPIs (status counts, redemption rate, value delivered /
   at-risk, avg days-to-claim, expiring-soon) + by-source / by-campaign / monthly
   breakdowns for the admin dashboard.
   buildRewardLedgerReport(): a normalized {columns, rows, totalRow} table (same
   model as the Milk reports engine) rendered to CSV / XLS / PDF for download.
   Reward value = quote(variant, plan).originalPaise × qty (un-discounted retail
   value of the free milk). Uses effStatus() so a past-expiry ISSUED reward counts
   as EXPIRED even before the daily cron writes it.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { quote } from "@/lib/pricing";

export interface RewardReport {
  type: string; title: string; subtitle: string;
  columns: { label: string; right?: boolean }[];
  rows: string[][]; totalRow?: string[]; rowCount: number;
}

const mlLabel = (ml: number) => (ml % 1000 === 0 ? `${ml / 1000} L` : `${ml} ml`);
const rup = (p: number) => "₹" + ((p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const istDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const STATUS_LABEL: Record<string, string> = { ISSUED: "Issued", REDEEMED: "Claimed", EXPIRED: "Expired", CANCELLED: "Cancelled" };
const effStatus = (r: { status: string; expiresAt: Date | null }, now: Date) =>
  r.status === "ISSUED" && r.expiresAt && r.expiresAt.getTime() < now.getTime() ? "EXPIRED" : r.status;

type PriceCtx = { variantByKey: Map<string, { type: "TRIAL" | "SUBSCRIPTION"; ml: number; dailyPaise: number | null; fixedPaise: number | null; fixedDays: number | null }>; planBySlug: Map<string, { days: number; discountBps: number }> };
async function pricingCtx(): Promise<PriceCtx> {
  const [products, plans] = await Promise.all([
    db.product.findMany({ select: { slug: true, variants: { select: { ml: true, type: true, dailyPaise: true, fixedPaise: true, fixedDays: true, active: true } } } }),
    db.plan.findMany({ select: { slug: true, days: true, discountBps: true } }),
  ]);
  const variantByKey: PriceCtx["variantByKey"] = new Map();
  for (const p of products) for (const v of p.variants) {
    const key = `${p.slug}:${v.ml}`;
    if (!variantByKey.has(key) || v.active) variantByKey.set(key, { type: v.type, ml: v.ml, dailyPaise: v.dailyPaise, fixedPaise: v.fixedPaise, fixedDays: v.fixedDays });
  }
  return { variantByKey, planBySlug: new Map(plans.map((p) => [p.slug, { days: p.days, discountBps: p.discountBps }])) };
}
function valuePaise(r: { productSlug: string; variantMl: number; qty: number; planSlug: string }, ctx: PriceCtx): number {
  const v = ctx.variantByKey.get(`${r.productSlug}:${r.variantMl}`);
  if (!v) return 0;
  const plan = ctx.planBySlug.get(r.planSlug);
  const q = quote(
    { type: v.type, ml: v.ml, dailyPaise: v.dailyPaise ?? undefined, fixedPaise: v.fixedPaise ?? undefined, fixedDays: v.fixedDays ?? undefined },
    plan ? { days: plan.days, discountBps: plan.discountBps } : undefined,
  );
  return q.originalPaise * (r.qty || 1);
}

// ---------- analytics ----------
export async function rewardAnalytics(now = new Date()) {
  const rows = await db.rewardRedemption.findMany({
    take: 20000, orderBy: { createdAt: "asc" },
    select: { status: true, source: true, campaignName: true, productSlug: true, variantMl: true, qty: true, planSlug: true, issuedAt: true, createdAt: true, expiresAt: true, redeemedAt: true },
  });
  const ctx = await pricingCtx();
  const counts: Record<string, number> = { ALL: 0, ISSUED: 0, REDEEMED: 0, EXPIRED: 0, CANCELLED: 0 };
  type Brk = { issued: number; redeemed: number; expired: number; cancelled: number; total: number };
  const bySrc = new Map<string, Brk & { source: string }>();
  const byCamp = new Map<string, Brk & { campaign: string; source: string }>();
  const monthly = new Map<string, { month: string; issued: number; claimed: number; expired: number }>();
  const mo = (k: string) => { let o = monthly.get(k); if (!o) { o = { month: k, issued: 0, claimed: 0, expired: 0 }; monthly.set(k, o); } return o; };
  let valueDeliveredPaise = 0, valueAtRiskPaise = 0, claimDaysSum = 0, claimN = 0, expiringSoon = 0;
  const soon = new Date(now.getTime() + 7 * 864e5);

  for (const r of rows) {
    const s = effStatus(r, now); counts.ALL++; counts[s] = (counts[s] || 0) + 1;
    const sl = s.toLowerCase() as keyof Brk;
    const src = bySrc.get(r.source) || { source: r.source, issued: 0, redeemed: 0, expired: 0, cancelled: 0, total: 0 };
    src[sl]++; src.total++; bySrc.set(r.source, src);
    const c = byCamp.get(r.campaignName) || { campaign: r.campaignName, source: r.source, issued: 0, redeemed: 0, expired: 0, cancelled: 0, total: 0 };
    c[sl]++; c.total++; byCamp.set(r.campaignName, c);
    mo(r.createdAt.toISOString().slice(0, 7)).issued++;
    if (r.redeemedAt) mo(r.redeemedAt.toISOString().slice(0, 7)).claimed++;
    if (s === "EXPIRED" && r.expiresAt) mo(r.expiresAt.toISOString().slice(0, 7)).expired++;
    const v = valuePaise(r, ctx);
    if (s === "REDEEMED") { valueDeliveredPaise += v; if (r.redeemedAt) { claimDaysSum += (r.redeemedAt.getTime() - r.issuedAt.getTime()) / 864e5; claimN++; } }
    else if (s === "ISSUED") { valueAtRiskPaise += v; if (r.expiresAt && r.expiresAt <= soon) expiringSoon++; }
  }
  const resolved = counts.REDEEMED + counts.EXPIRED + counts.CANCELLED;
  return {
    counts,
    redemptionRate: counts.ALL ? counts.REDEEMED / counts.ALL : 0,
    redemptionRateResolved: resolved ? counts.REDEEMED / resolved : 0,
    valueDeliveredPaise, valueAtRiskPaise,
    avgDaysToClaim: claimN ? Math.round((claimDaysSum / claimN) * 10) / 10 : null,
    expiringSoon,
    bySource: [...bySrc.values()].sort((a, b) => b.total - a.total),
    byCampaign: [...byCamp.values()].sort((a, b) => b.total - a.total).slice(0, 12),
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// ---------- ledger export (normalized table) ----------
export async function buildRewardLedgerReport(opts: { status?: string | null; source?: string | null; search?: string | null }, now = new Date()): Promise<RewardReport> {
  const where: Record<string, unknown> = {};
  if (opts.status && ["ISSUED", "REDEEMED", "EXPIRED", "CANCELLED"].includes(opts.status)) where.status = opts.status;
  if (opts.source) where.source = opts.source;
  const s = (opts.search || "").trim();
  if (s) where.OR = [{ code: { contains: s.toUpperCase() } }, { campaignName: { contains: s, mode: "insensitive" } }];

  const list = await db.rewardRedemption.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 });
  const ctx = await pricingCtx();
  const userIds = [...new Set(list.flatMap((r) => [r.issuedToUserId, r.redeemedByUserId]).filter(Boolean) as string[])];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }) : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  const uLabel = (id: string | null) => (id ? uMap.get(id)?.email || uMap.get(id)?.name || id : "");

  let totalValue = 0;
  const rows = list.map((r) => {
    const st = effStatus(r, now);
    const v = valuePaise(r, ctx); totalValue += v;
    return [
      r.code, r.campaignName, r.source === "puzzle_challenge" ? "Puzzle winner" : "Manual",
      `${mlLabel(r.variantMl)} × ${r.qty}`, r.planSlug, STATUS_LABEL[st] || st,
      uLabel(r.issuedToUserId), istDate(r.issuedAt), r.expiresAt ? istDate(r.expiresAt) : "—",
      r.redeemedAt ? istDate(r.redeemedAt) : "—", uLabel(r.redeemedByUserId), rup(v),
    ];
  });
  const stamp = now.toLocaleString("en-IN");
  return {
    type: "ledger", title: "DOODLY Reward Report",
    subtitle: `${list.length} reward(s)${opts.status ? ` · ${STATUS_LABEL[opts.status] || opts.status}` : ""}${opts.source ? ` · ${opts.source === "puzzle_challenge" ? "Puzzle winners" : "Manual"}` : ""} · ${stamp}`,
    columns: [
      { label: "Code" }, { label: "Campaign" }, { label: "Source" }, { label: "Product" }, { label: "Plan" }, { label: "Status" },
      { label: "Issued to" }, { label: "Issued" }, { label: "Expires" }, { label: "Claimed" }, { label: "Claimed by" }, { label: "Value", right: true },
    ],
    rows, rowCount: list.length,
    totalRow: ["TOTAL", "", "", "", "", "", "", "", "", "", "", rup(totalValue)],
  };
}

// ---------- renderers (CSV / XLS; PDF reuses the generic milk renderer) ----------
export function rewardReportCsv(r: RewardReport): string {
  const q = (c: string) => '"' + String(c ?? "").replace(/"/g, '""') + '"';
  const all = [r.columns.map((c) => c.label), ...r.rows, ...(r.totalRow ? [r.totalRow] : [])];
  return all.map((row) => row.map(q).join(",")).join("\r\n");
}
export function rewardReportXls(r: RewardReport): string {
  const esc = (c: string) => String(c ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const align = (i: number) => (r.columns[i]?.right ? "right" : "left");
  const th = r.columns.map((c) => `<th style="text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const tr = (row: string[], bold = false) => `<tr${bold ? ' style="font-weight:bold"' : ""}>` + row.map((c, i) => `<td style="text-align:${align(i)}">${esc(c)}</td>`).join("") + "</tr>";
  return `<html><head><meta charset="utf-8"></head><body><h3>${esc(r.title)}</h3><p>${esc(r.subtitle)}</p><table border="1" cellspacing="0" cellpadding="4"><thead><tr>${th}</tr></thead><tbody>${r.rows.map((row) => tr(row)).join("")}${r.totalRow ? tr(r.totalRow, true) : ""}</tbody></table></body></html>`;
}
export function rewardReportFilename(ext: string, now = new Date()): string {
  return `DOODLY_Rewards_${now.toISOString().slice(0, 10)}.${ext}`;
}
