"use client";

import { useEffect, useState } from "react";
import { inr } from "@/lib/pricing";
import type { WalletView } from "@/lib/wallet/dashboard-types";

const KIND_LABEL: Record<string, string> = {
  cashback: "Trial Pack cashback", referral: "Referral reward", promo: "Promotional credit",
  usage: "Used on order", topup: "Wallet top-up", refund: "Refund", adjustment: "Adjustment", reversal: "Reversal",
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function WalletPanel() {
  const [data, setData] = useState<WalletView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signedout" | "error">("loading");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (res.status === 401) { setState("signedout"); return; }
        if (!res.ok) { setState("error"); return; }
        setData(await res.json()); setState("ready");
      } catch { setState("error"); }
    })();
  }, []);

  if (state === "loading") return <p className="text-sm text-ink-3">Loading your wallet…</p>;
  if (state === "signedout") return <Notice title="Sign in to view your wallet" body="Your DOODLY Wallet balance, cashback and transactions appear here once you're signed in." />;
  if (state === "error" || !data) return <Notice title="Couldn't load your wallet" body="Please refresh and try again." tone="error" />;

  const s = data.summary;
  return (
    <div className="space-y-6">
      {/* balance hero */}
      <div className="rounded-2xl bg-gradient-to-br from-forest to-[#0a2e22] p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-mint">Available balance</p>
        <p className="mt-1 font-display text-4xl font-bold">{inr(data.balancePaise)}</p>
        <p className="mt-1 text-sm text-white/70">Usable on any future order or subscription renewal.</p>
      </div>

      {/* breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={inr(s.cashbackEarnedPaise)} l="Trial Pack cashback" />
        <Stat n={inr(s.referralRewardsPaise)} l="Referral rewards" />
        <Stat n={inr(s.promoCreditsPaise)} l="Promotional credits" />
        <Stat n={inr(s.usedPaise)} l="Used so far" />
      </div>

      {/* transactions */}
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold text-forest">Transaction history</h3>
        <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
              <tr>{["Date", "Description", "Credit / Debit", "Balance after", "Reference"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id} className="border-b border-mint-soft/60">
                  <td className="px-4 py-3 text-ink-3">{fmtDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-2">{t.description ?? KIND_LABEL[t.kind] ?? t.kind}</td>
                  <td className={`px-4 py-3 font-semibold ${t.type === "CREDIT" ? "text-leaf-600" : "text-red-600"}`}>{t.type === "CREDIT" ? "+" : "−"}{inr(t.amountPaise)}</td>
                  <td className="px-4 py-3 text-forest">{inr(t.balanceAfterPaise)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-3">{t.reference}</td>
                </tr>
              ))}
              {!data.transactions.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">No wallet transactions yet. Complete a Trial Pack, then upgrade to a 30 or 90-day plan to earn ₹200 cashback.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-2xl border border-mint-soft bg-white p-4">
      <p className="font-display text-xl font-bold text-forest">{n}</p>
      <p className="mt-0.5 text-xs text-ink-3">{l}</p>
    </div>
  );
}

function Notice({ title, body, tone }: { title: string; body: string; tone?: "error" }) {
  return (
    <div className={`rounded-2xl border p-8 text-center ${tone === "error" ? "border-red-200 bg-red-50" : "border-mint-soft bg-white"}`}>
      <p className="font-display text-xl font-semibold text-forest">{title}</p>
      <p className="mt-2 text-sm text-ink-2">{body}</p>
    </div>
  );
}
