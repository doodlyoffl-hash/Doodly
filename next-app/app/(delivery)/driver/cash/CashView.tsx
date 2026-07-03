"use client";

import Link from "next/link";
import { inr } from "@/lib/pricing";
import { StatCard } from "@/components/dashboard/Shell";
import { StateGate, EmptyState, StatusPill } from "@/components/account/ui";
import { useRoute, isToday } from "@/components/driver/board";

export function CashView() {
  const { data, state } = useRoute();
  const today = (data?.stops ?? []).filter((s) => isToday(s.date)).sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));
  const withCash = today.filter((s) => s.cashCollected > 0);
  const total = today.reduce((s, d) => s + d.cashCollected, 0);

  return (
    <StateGate state={state} signedOutTitle="Sign in to see cash collection">
      {today.length === 0 ? (
        <EmptyState title="No deliveries today" body="No cash to collect." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard n={inr(total)} l="Cash collected today" />
            <StatCard n={String(withCash.length)} l="Cash payments" />
          </div>
          {withCash.length === 0 ? (
            <EmptyState title="No cash collected yet" body="Most stops are prepaid. Record any cash when you mark a stop delivered." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                  <tr>{["#", "Customer", "Cash", "Status"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {withCash.map((s) => (
                    <tr key={s.id} className="border-b border-mint-soft/60">
                      <td className="px-4 py-3 text-ink-3">{s.sequence ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-forest">{s.customer.name ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-forest">{inr(s.cashCollected)}</td>
                      <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-ink-3">Record cash when you mark a stop delivered on the <Link href="/driver/route" className="font-semibold text-leaf-600 hover:underline">route</Link>.</p>
        </div>
      )}
    </StateGate>
  );
}
