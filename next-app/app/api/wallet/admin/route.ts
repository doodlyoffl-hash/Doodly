/* /api/wallet/admin — Wallet Management (RBAC: payments/billing).
   GET  ?view=list|reports|config   — balances, analytics, cashback rules
   POST { action: "credit"|"debit"|"reverse"|"config"|"cashback", … } */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listWallets, walletReports, getCashbackConfig, setCashbackConfig,
  adminCredit, adminDebit, reverseTxn, creditTrialCashback,
} from "@/lib/wallet/service";
import { actorRole, canViewWallets, canManageWallets } from "@/lib/wallet/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewWallets(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const view = req.nextUrl.searchParams.get("view") ?? "list";
  try {
    if (view === "reports") {
      return NextResponse.json(await walletReports({
        from: req.nextUrl.searchParams.get("from") ?? undefined,
        to: req.nextUrl.searchParams.get("to") ?? undefined,
      }), { headers: { "Cache-Control": "no-store" } });
    }
    if (view === "config") return NextResponse.json(await getCashbackConfig());
    return NextResponse.json({ wallets: await listWallets({ q: req.nextUrl.searchParams.get("q") ?? undefined }) }, { headers: { "Cache-Control": "no-store" } });
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
  z.object({
    action: z.literal("config"),
    enabled: z.boolean().optional(),
    amountPaise: z.number().int().nonnegative().optional(),
    eligiblePlanSlugs: z.array(z.string()).optional(),
    expiryDays: z.number().int().nonnegative().nullable().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const role = actorRole(req);
  if (!canManageWallets(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const a = { actorRole: role };
  try {
    const d = parsed.data;
    const result =
      d.action === "credit" ? await adminCredit({ userId: d.userId, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "debit" ? await adminDebit({ userId: d.userId, amountPaise: d.amountPaise, reason: d.reason, ...a })
      : d.action === "reverse" ? await reverseTxn({ txnId: d.txnId, ...a })
      : d.action === "cashback" ? await creditTrialCashback({ userId: d.userId, subscriptionId: d.subscriptionId, ...a })
      : await setCashbackConfig({ enabled: d.enabled, amountPaise: d.amountPaise, eligiblePlanSlugs: d.eligiblePlanSlugs, expiryDays: d.expiryDays, ...a });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Action failed" }, { status: 409 });
  }
}
