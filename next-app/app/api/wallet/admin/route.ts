/* /api/wallet/admin — Wallet Management (RBAC: payments/billing).
   GET  ?view=list|reports|config   — balances, analytics, cashback rules
   POST { action: "credit"|"debit"|"reverse"|"config"|"cashback", … } */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listWallets, walletReports, getCashbackConfig, setCashbackConfig,
  adminCredit, adminDebit, reverseTxn, creditTrialCashback,
  walletDetail, listAllTransactions, creditReferralReward, bulkCredit, bulkDebit,
  refundBottleDeposit,
} from "@/lib/wallet/service";
import { requestAdjustment, approveAdjustment, rejectAdjustment, listAdjustments } from "@/lib/wallet/adjustments";
import { getWalletExpiryConfig, setWalletExpiryConfig, expireWalletCredits } from "@/lib/wallet/expiry";
import { actorRole, actorId, canViewWallets, canManageWallets } from "@/lib/wallet/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewWallets(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  try {
    if (view === "reports" || view === "dashboard") {
      return NextResponse.json(await walletReports({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }), { headers: { "Cache-Control": "no-store" } });
    }
    if (view === "config") return NextResponse.json(await getCashbackConfig());
    if (view === "expiryConfig") return NextResponse.json(await getWalletExpiryConfig());
    if (view === "adjustments") return NextResponse.json({ adjustments: await listAdjustments({ status: sp.get("status") ?? undefined }) }, { headers: { "Cache-Control": "no-store" } });
    if (view === "detail") {
      const userId = sp.get("userId");
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      return NextResponse.json(await walletDetail(userId), { headers: { "Cache-Control": "no-store" } });
    }
    if (view === "transactions") {
      return NextResponse.json({
        transactions: await listAllTransactions({
          from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined,
          kind: sp.get("kind") ?? undefined, type: (sp.get("type") as "CREDIT" | "DEBIT") ?? undefined,
          q: sp.get("q") ?? undefined, userId: sp.get("userId") ?? undefined,
          limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
        }),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ wallets: await listWallets({ q: sp.get("q") ?? undefined }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("wallet.admin.get", (e as Error)?.message);
    return NextResponse.json({ error: "Could not load wallet data." }, { status: 500 });
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("credit"), userId: z.string().min(1), amountPaise: z.number().int().positive(), reason: z.string().min(1) }),
  z.object({ action: z.literal("debit"), userId: z.string().min(1), amountPaise: z.number().int().positive(), reason: z.string().min(1) }),
  z.object({ action: z.literal("reverse"), txnId: z.string().min(1) }),
  z.object({ action: z.literal("cashback"), userId: z.string().min(1), subscriptionId: z.string().optional() }),
  z.object({ action: z.literal("referral"), referrerId: z.string().min(1), refereeId: z.string().min(1), amountPaise: z.number().int().positive().optional() }),
  z.object({ action: z.literal("bottleRefund"), userId: z.string().min(1), amountPaise: z.number().int().positive(), qty: z.number().int().nonnegative().optional(), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("bulkCredit"), userIds: z.array(z.string().min(1)).min(1).max(500), amountPaise: z.number().int().positive(), reason: z.string().min(1) }),
  z.object({ action: z.literal("bulkDebit"), userIds: z.array(z.string().min(1)).min(1).max(500), amountPaise: z.number().int().positive(), reason: z.string().min(1) }),
  z.object({ action: z.literal("requestAdjustment"), userId: z.string().min(1), type: z.enum(["CREDIT", "DEBIT"]), amountPaise: z.number().int().positive(), reason: z.string().min(1).max(200) }),
  z.object({ action: z.literal("approveAdjustment"), id: z.string().min(1), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("rejectAdjustment"), id: z.string().min(1), note: z.string().max(200).optional() }),
  z.object({
    action: z.literal("config"),
    enabled: z.boolean().optional(),
    amountPaise: z.number().int().nonnegative().optional(),
    eligiblePlanSlugs: z.array(z.string()).optional(),
    expiryDays: z.number().int().nonnegative().nullable().optional(),
  }),
  z.object({
    action: z.literal("expiryConfig"),
    enabled: z.boolean().optional(),
    expiryDays: z.number().int().positive().optional(),
    expiringKinds: z.array(z.string()).optional(),
    remindDays: z.array(z.number().int().positive()).optional(),
  }),
  z.object({ action: z.literal("expireNow") }),
]);

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canManageWallets(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const a = { actorRole: role, actorId: actorId(req) ?? undefined, ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || undefined, userAgent: req.headers.get("user-agent") ?? undefined };
  const d = parsed.data;
  // Approve/reject a manual adjustment is a CHECKER action → Super-Admin only (maker-checker).
  if ((d.action === "approveAdjustment" || d.action === "rejectAdjustment") && role !== "super_admin") {
    return NextResponse.json({ error: "Approving or rejecting a wallet adjustment is Super-Admin only." }, { status: 403 });
  }
  // Changing the promo-expiry policy or forcing a sweep can DEBIT customer wallets → Super-Admin only.
  if ((d.action === "expiryConfig" || d.action === "expireNow") && role !== "super_admin") {
    return NextResponse.json({ error: "Changing the promotional-credit expiry policy is Super-Admin only." }, { status: 403 });
  }
  try {
    const result =
      d.action === "requestAdjustment" ? await requestAdjustment({ userId: d.userId, type: d.type, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "approveAdjustment" ? await approveAdjustment(d.id, { note: d.note, ...a })
      : d.action === "rejectAdjustment" ? await rejectAdjustment(d.id, { note: d.note, ...a })
      : d.action === "credit" ? await adminCredit({ userId: d.userId, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "debit" ? await adminDebit({ userId: d.userId, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "reverse" ? await reverseTxn({ txnId: d.txnId, ...a })
      : d.action === "cashback" ? await creditTrialCashback({ userId: d.userId, subscriptionId: d.subscriptionId, ...a })
      : d.action === "referral" ? await creditReferralReward({ referrerId: d.referrerId, refereeId: d.refereeId, amountPaise: d.amountPaise, ...a })
      : d.action === "bottleRefund" ? await refundBottleDeposit({ userId: d.userId, amountPaise: d.amountPaise, qty: d.qty, note: d.note, ...a })
      : d.action === "bulkCredit" ? await bulkCredit({ userIds: d.userIds, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "bulkDebit" ? await bulkDebit({ userIds: d.userIds, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "expiryConfig" ? await setWalletExpiryConfig({ enabled: d.enabled, expiryDays: d.expiryDays, expiringKinds: d.expiringKinds, remindDays: d.remindDays })
      : d.action === "expireNow" ? await expireWalletCredits()
      : await setCashbackConfig({ enabled: d.enabled, amountPaise: d.amountPaise, eligiblePlanSlugs: d.eligiblePlanSlugs, expiryDays: d.expiryDays, ...a });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
