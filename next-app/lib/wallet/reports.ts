/* =============================================================
   DOODLY Wallet — admin reports + exports (PDF / XLS / CSV).
   Reuses the generic normalized-table renderers from the milk report engine
   (columns + rows + optional total row → one CSV/XLS/PDF pipeline). Every report
   reads LIVE from the WalletTxn ledger / WalletAdjustmentRequest — no mock data.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { walletReports, listWallets } from "./service";
import { listAdjustments } from "./adjustments";
import type { MilkReport } from "@/lib/milk/reports";
import { milkReportCsv, milkReportXls } from "@/lib/milk/reports";
import { renderMilkReportPdf } from "@/lib/milk/report-pdf";

export const WALLET_REPORTS = ["summary", "customer", "liability", "refund", "bottleRefund", "trialRefund", "referral", "adjustment", "expiry"] as const;
export type WalletReportKey = (typeof WALLET_REPORTS)[number];

const rup = (p: number) => "₹" + ((p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dtm = (d: Date) => d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const mk = (key: WalletReportKey, o: Omit<MilkReport, "type" | "rowCount">): MilkReport => ({ type: key as unknown as MilkReport["type"], rowCount: o.rows.length, ...o });

async function ledger(where: Prisma.WalletTxnWhereInput, from?: Date, to?: Date) {
  const range: Prisma.DateTimeFilter = {};
  if (from) range.gte = from; if (to) range.lte = to;
  return db.walletTxn.findMany({
    where: { ...where, ...(from || to ? { createdAt: range } : {}) },
    orderBy: { createdAt: "desc" }, take: 20000,
    include: { user: { select: { name: true, phone: true } } },
  });
}

/** A ledger-slice report: Date · Customer · Type · Amount · Reason · Reference. */
async function ledgerReport(key: WalletReportKey, title: string, where: Prisma.WalletTxnWhereInput, from?: Date, to?: Date): Promise<MilkReport> {
  const rows = await ledger(where, from, to);
  const total = rows.reduce((s, r) => s + (r.type === "CREDIT" ? r.amountPaise : -r.amountPaise), 0);
  const cr = rows.filter((r) => r.type === "CREDIT").reduce((s, r) => s + r.amountPaise, 0);
  return mk(key, {
    title, subtitle: `${rows.length} transaction(s) · credited ${rup(cr)} · net ${rup(total)}`,
    columns: [{ label: "Date" }, { label: "Customer" }, { label: "Type" }, { label: "Amount", right: true }, { label: "Reason" }, { label: "Reference" }],
    rows: rows.map((r) => [dtm(r.createdAt), r.user?.name ?? r.user?.phone ?? "—", r.type, rup(r.amountPaise), r.reason, r.reference]),
    totalRow: ["TOTAL", "", "", rup(cr), "", ""],
  });
}

export async function buildWalletReport(key: WalletReportKey, from?: Date, to?: Date): Promise<MilkReport> {
  switch (key) {
    case "summary": {
      const w = await walletReports({ from, to });
      const rows: string[][] = [
        ["Total wallet liability", rup(w.totalBalancePaise)],
        ["Active wallets", String(w.activeWallets)],
        ["Average balance", rup(w.averageBalancePaise)],
        ["Credits today", rup(w.creditsTodayPaise)],
        ["Debits today", rup(w.debitsTodayPaise)],
        ["Transactions today", String(w.transactionsToday)],
        ["Transactions this month", String(w.transactionsThisMonth)],
        ["Total credited (range)", rup(w.totalCreditedPaise)],
        ["Wallet used (range)", rup(w.walletUsedPaise)],
        ["Cashback issued (range)", rup(w.totalCashbackIssuedPaise)],
        ["Trial cashback redeemed", `${w.trialCashbackRedeemed} · ${rup(w.trialCashbackRedeemedPaise)}`],
        ["Referral rewards", `${w.referralRewardsCount} · ${rup(w.referralRewardsAllTimePaise)}`],
        ["Refunds — processed", rup(w.processedRefundsPaise)],
        ["Refunds — pending (bottle deposits owed)", `${w.pendingRefundsCount} · ${rup(w.pendingRefundsPaise)}`],
        ["Manual adjustments — pending approval", `${w.pendingAdjustments} · ${rup(w.pendingAdjustmentsPaise)}`],
        ["Promotional credit expired (range)", rup(w.expiredCreditsPaise)],
        ["Promotional credit expiring in 30 days", `${w.expiringSoonCount} · ${rup(w.expiringSoonPaise)}`],
        ["Trial → subscription conversion", `${w.cashbackConversionRate}%`],
      ];
      return mk("summary", { title: "Wallet Summary", subtitle: `Wallet ledger overview`, columns: [{ label: "Metric" }, { label: "Value", right: true }], rows });
    }
    case "customer":
    case "liability": {
      const ws = await listWallets({});
      const sorted = key === "liability" ? [...ws].sort((a, b) => b.walletPaise - a.walletPaise) : ws;
      const totalBal = ws.reduce((s, w) => s + w.walletPaise, 0);
      return mk(key, {
        title: key === "liability" ? "Wallet Liability Report" : "Customer Wallet Report",
        subtitle: `${ws.length} wallet(s) · total liability ${rup(totalBal)}`,
        columns: [{ label: "Customer" }, { label: "Phone" }, { label: "Balance", right: true }, { label: "Trial" }],
        rows: sorted.map((w) => [w.name ?? "—", w.phone ?? "—", rup(w.walletPaise), w.trialStatus ?? "—"]),
        totalRow: ["TOTAL", "", rup(totalBal), ""],
      });
    }
    case "expiry": return ledgerReport("expiry", "Promotional Credit Expiry Report", { kind: "expiry" }, from, to);
    case "refund": return ledgerReport("refund", "Wallet Refund Report", { kind: "refund" }, from, to);
    case "bottleRefund": return ledgerReport("bottleRefund", "Bottle Deposit Refund Report", { kind: "refund", reason: "bottle_deposit_refund" }, from, to);
    case "trialRefund": return ledgerReport("trialRefund", "Trial Upgrade Cashback Report", { kind: "cashback", reason: "trial_cashback" }, from, to);
    case "referral": return ledgerReport("referral", "Referral Reward Report", { kind: "referral" }, from, to);
    case "adjustment": {
      const adj = await listAdjustments({});
      return mk("adjustment", {
        title: "Manual Adjustment Report", subtitle: `${adj.length} request(s)`,
        columns: [{ label: "Date" }, { label: "Code" }, { label: "Customer" }, { label: "Type" }, { label: "Amount", right: true }, { label: "Status" }, { label: "Reason" }],
        rows: adj.map((a) => [dtm(new Date(a.createdAt)), a.code, a.customerName, a.type, rup(a.amountPaise), a.status, a.reason]),
      });
    }
  }
}

export function walletReportFilename(key: WalletReportKey, ext: string) {
  return `DOODLY_Wallet_${key}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}
export { milkReportCsv as walletReportCsv, milkReportXls as walletReportXls, renderMilkReportPdf as renderWalletReportPdf };
