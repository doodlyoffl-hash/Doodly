"use client";

import { inr } from "@/lib/pricing";
import { StatCard } from "@/components/dashboard/Shell";
import { useResource, StateGate, Card, fmtDate } from "@/components/account/ui";

interface Activity { id: string; kind: string; amountPaise: number; description: string | null; createdAt: string }
interface Rewards {
  points: number; tier: string; redeemablePaise: number;
  nextTier: { name: string; pointsAway: number } | null;
  activity: Activity[];
}
const KIND_LABEL: Record<string, string> = { cashback: "Trial Pack cashback", referral: "Referral reward", promo: "Promotional credit" };

export function RewardsView() {
  const { data, state } = useResource<{ rewards: Rewards }>("/api/account/rewards");
  const r = data?.rewards;
  return (
    <StateGate state={state} signedOutTitle="Sign in to see your rewards" signedOutBody="Your loyalty points and perks appear here once you're signed in.">
      {r && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard n={r.points.toLocaleString("en-IN")} l="Reward points" />
            <StatCard n={r.tier} l="Your tier" />
            <StatCard n={inr(r.redeemablePaise)} l="Redeemable value" />
          </div>

          {r.nextTier && (
            <Card>
              <p className="text-sm text-ink-2">You&apos;re <span className="font-semibold text-forest">{r.nextTier.pointsAway.toLocaleString("en-IN")} points</span> away from <span className="font-semibold text-leaf-600">{r.nextTier.name}</span>.</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-mint-soft">
                <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.min(100, Math.round((r.points / (r.points + r.nextTier.pointsAway)) * 100))}%` }} />
              </div>
            </Card>
          )}

          <div>
            <h3 className="mb-3 font-display text-lg font-semibold text-forest">Recent rewards</h3>
            {r.activity.length === 0 ? (
              <Card><p className="text-sm text-ink-3">No rewards yet. Complete a Trial Pack, then upgrade to a 30 or 90-day plan to earn cashback, or refer a friend to earn ₹200.</p></Card>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                    <tr>{["Date", "Reward", "Value"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {r.activity.map((a) => (
                      <tr key={a.id} className="border-b border-mint-soft/60">
                        <td className="px-4 py-3 text-ink-3">{fmtDate(a.createdAt)}</td>
                        <td className="px-4 py-3 text-ink-2">{a.description ?? KIND_LABEL[a.kind] ?? a.kind}</td>
                        <td className="px-4 py-3 font-semibold text-leaf-600">+{inr(a.amountPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">How to earn</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              <li>• ₹200 cashback when you upgrade a Trial Pack to a 30 or 90-day plan.</li>
              <li>• ₹200 for every friend who subscribes with your referral code.</li>
              <li>• Points on every delivery — redeem them against future orders.</li>
            </ul>
          </Card>
        </div>
      )}
    </StateGate>
  );
}
