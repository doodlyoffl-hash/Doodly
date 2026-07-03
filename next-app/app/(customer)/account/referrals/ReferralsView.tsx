"use client";

import { useState } from "react";
import { inr } from "@/lib/pricing";
import { StatCard } from "@/components/dashboard/Shell";
import { useResource, StateGate, Card, EmptyState, fmtDate } from "@/components/account/ui";

interface Referral {
  code: string; shareUrl: string; referredCount: number; earningsPaise: number;
  friends: { name: string; joinedAt: string }[];
}

export function ReferralsView() {
  const { data, state } = useResource<{ referral: Referral }>("/api/account/referrals");
  const r = data?.referral;
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }
  const waText = r ? encodeURIComponent(`Try DOODLY fresh A2 milk! Use my code ${r.code} to get ₹200 off your first subscription: ${r.shareUrl}`) : "";

  return (
    <StateGate state={state} signedOutTitle="Sign in to refer friends" signedOutBody="Your referral code and earnings appear here once you're signed in.">
      {r && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard n={String(r.referredCount)} l="Friends referred" />
            <StatCard n={inr(r.earningsPaise)} l="Referral earnings" />
          </div>

          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Your referral code</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="select-all rounded-xl bg-mint-soft px-5 py-2 font-mono text-xl font-bold tracking-widest text-leaf-600">{r.code}</span>
              <button onClick={() => copy(r.code)} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">{copied ? "Copied!" : "Copy code"}</button>
              <button onClick={() => copy(r.shareUrl)} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Copy link</button>
              <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener" className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600">Share on WhatsApp</a>
            </div>
            <p className="mt-3 text-sm text-ink-2">Share your code. When a friend subscribes, you both get <span className="font-semibold text-forest">₹200</span> in wallet credit.</p>
          </Card>

          <div>
            <h3 className="mb-3 font-display text-lg font-semibold text-forest">Friends you&apos;ve referred</h3>
            {r.friends.length === 0 ? (
              <EmptyState title="No referrals yet" body="Share your code to start earning ₹200 per friend." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                    <tr>{["Friend", "Joined"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {r.friends.map((f, i) => (
                      <tr key={i} className="border-b border-mint-soft/60">
                        <td className="px-4 py-3 font-semibold text-forest">{f.name}</td>
                        <td className="px-4 py-3 text-ink-3">{fmtDate(f.joinedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </StateGate>
  );
}
