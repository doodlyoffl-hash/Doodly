"use client";

import { inr } from "@/lib/pricing";
import { StatCard } from "@/components/dashboard/Shell";
import { useResource, StateGate, EmptyState, fmtDate } from "@/components/account/ui";

interface Ledger { id: string; event: string; qty: number; amountPaise: number; note: string | null; createdAt: string; delivery: { date: string } | null }
interface Summary { issued: number; returned: number; lost: number; pending: number; depositPaise: number }

const EVENT_LABEL: Record<string, string> = {
  ISSUED: "Bottles delivered", RETURNED: "Empties collected", LOST: "Reported lost",
  DEPOSIT_CHARGED: "Deposit charged", DEPOSIT_REFUNDED: "Deposit refunded",
};

export function BottlesView() {
  const { data, state } = useResource<{ ledger: Ledger[]; summary: Summary }>("/api/bottles");
  const ledger = data?.ledger ?? [];
  const s = data?.summary;
  return (
    <StateGate state={state} signedOutTitle="Sign in to see your bottles" signedOutBody="Your glass-bottle ledger appears here once you're signed in.">
      {s && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard n={String(s.pending)} l="Pending return" />
            <StatCard n={String(s.returned)} l="Returned" />
            <StatCard n={String(s.issued)} l="Total delivered" />
            <StatCard n={inr(s.depositPaise)} l="Deposit held" />
          </div>

          {ledger.length === 0 ? (
            <EmptyState title="No bottle activity yet" body="Once your deliveries begin, every bottle in and out is tracked here." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                  <tr>{["Date", "Activity", "Qty", "Amount", "Note"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id} className="border-b border-mint-soft/60">
                      <td className="px-4 py-3 text-ink-3">{fmtDate(l.delivery?.date ?? l.createdAt)}</td>
                      <td className="px-4 py-3 text-ink-2">{EVENT_LABEL[l.event] ?? l.event}</td>
                      <td className="px-4 py-3 font-semibold text-forest">{l.qty}</td>
                      <td className="px-4 py-3 text-ink-2">{l.amountPaise ? inr(l.amountPaise) : "—"}</td>
                      <td className="px-4 py-3 text-ink-3">{l.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </StateGate>
  );
}
