"use client";

import Link from "next/link";
import { StatCard } from "@/components/dashboard/Shell";
import { StateGate, EmptyState, StatusPill } from "@/components/account/ui";
import { useRoute, DONE, isToday } from "@/components/driver/board";

export function BottlesView() {
  const { data, state } = useRoute();
  const today = (data?.stops ?? []).filter((s) => isToday(s.date)).sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));
  const pending = today.filter((s) => !DONE(s.status));
  const delivered = today.filter((s) => s.status === "DELIVERED");
  const toCollect = pending.reduce((s, d) => s + d.bottleCount, 0);
  const collected = delivered.reduce((s, d) => s + d.bottlesIn, 0);
  const handedOver = delivered.reduce((s, d) => s + d.bottlesOut, 0);

  return (
    <StateGate state={state} signedOutTitle="Sign in to see bottle collection">
      {today.length === 0 ? (
        <EmptyState title="No deliveries today" body="Nothing to collect." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard n={String(toCollect)} l="Bottles to pick up" />
            <StatCard n={String(collected)} l="Empties collected" />
            <StatCard n={String(handedOver)} l="Bottles delivered" />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["#", "Customer", "To deliver", "Empties collected", "Status"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {today.map((s) => (
                  <tr key={s.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 text-ink-3">{s.sequence ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-forest">{s.customer.name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{s.bottleCount}</td>
                    <td className="px-4 py-3 text-ink-2">{s.status === "DELIVERED" ? s.bottlesIn : "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-ink-3">Record empties when you mark a stop delivered on the <Link href="/driver/route" className="font-semibold text-leaf-600 hover:underline">route</Link>.</p>
        </div>
      )}
    </StateGate>
  );
}
