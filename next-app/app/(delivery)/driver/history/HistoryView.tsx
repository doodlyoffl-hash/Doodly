"use client";

import { inr } from "@/lib/pricing";
import { StateGate, EmptyState, StatusPill, fmtDate } from "@/components/account/ui";
import { useRoute } from "@/components/driver/board";

export function HistoryView() {
  const { data, state } = useRoute();
  const rows = (data?.stops ?? [])
    .filter((s) => ["DELIVERED", "FAILED", "SKIPPED"].includes(s.status))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <StateGate state={state} signedOutTitle="Sign in to see your history">
      {rows.length === 0 ? (
        <EmptyState title="No history yet" body="Your completed deliveries will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
              <tr>{["Date", "Customer", "Empties", "Cash", "Status"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-mint-soft/60">
                  <td className="px-4 py-3 text-ink-2">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3 font-semibold text-forest">{s.customer.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{s.bottlesIn}</td>
                  <td className="px-4 py-3 text-ink-2">{s.cashCollected ? inr(s.cashCollected) : "—"}</td>
                  <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StateGate>
  );
}
