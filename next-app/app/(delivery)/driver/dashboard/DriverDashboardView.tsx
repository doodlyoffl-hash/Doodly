"use client";

import Link from "next/link";
import { PageHead, StatCard } from "@/components/dashboard/Shell";
import { inr } from "@/lib/pricing";
import { useResource, StateGate } from "@/components/account/ui";

interface Summary {
  name: string | null; employeeId: string | null;
  stopsToday: number; deliveredToday: number; pendingToday: number;
  cashCollectedPaise: number; bottlesToCollect: number; bottlesCollectedToday: number;
}
const hour = new Date().getHours();
const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

export function DriverDashboardView() {
  const { data, state } = useResource<{ summary: Summary }>("/api/driver/summary");
  const s = data?.summary;
  return (
    <>
      <PageHead
        title={`${greeting}${s?.name ? `, ${s.name.split(" ")[0]}` : ""} 🌅`}
        sub={s ? `${s.employeeId ?? "Driver"} · ${s.stopsToday} stops today` : "Your route for today."}
      />
      <StateGate state={state} signedOutTitle="Sign in to see your route" signedOutBody="Your assigned deliveries appear here once you're signed in.">
        {s && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard n={String(s.stopsToday)} l="Stops today" />
              <StatCard n={String(s.deliveredToday)} l="Delivered" />
              <StatCard n={inr(s.cashCollectedPaise)} l="Cash collected" />
              <StatCard n={String(s.bottlesToCollect)} l="Bottles to pick up" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/driver/route" className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">Start today&apos;s route →</Link>
              <Link href="/driver/deliveries" className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">All deliveries</Link>
            </div>
          </div>
        )}
      </StateGate>
    </>
  );
}
