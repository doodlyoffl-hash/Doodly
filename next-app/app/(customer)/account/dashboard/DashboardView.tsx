"use client";

import Link from "next/link";
import { PageHead, StatCard } from "@/components/dashboard/Shell";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, Card, StatusPill, fmtDay } from "@/components/account/ui";

interface Summary {
  name: string | null;
  walletPaise: number;
  loyaltyPoints: number;
  bottlesPending: number;
  nextDelivery: { date: string; status: string; slot: string | null } | null;
  activeSubscription: { id: string; planName: string; status: string; nextDeliveryAt: string | null; items: { qty: number; label: string; product: string }[] } | null;
  counts: { orders: number; deliveries: number; invoices: number };
}

const hour = new Date().getHours();
const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

export function DashboardView() {
  const { data, state } = useResource<{ summary: Summary }>("/api/account/summary");
  const s = data?.summary;
  return (
    <>
      <PageHead title={`${greeting}${s?.name ? `, ${s.name.split(" ")[0]}` : ""} 👋`} sub="Here's everything about your milk today." />
      <StateGate state={state} signedOutTitle="Sign in to see your dashboard" signedOutBody="Your deliveries, wallet and subscription appear here once you're signed in.">
        {s && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard n={s.nextDelivery ? fmtDay(s.nextDelivery.date) : "—"} l={s.nextDelivery ? `Next delivery · ${s.nextDelivery.slot ?? "6–8 AM"}` : "No upcoming delivery"} />
              <StatCard n={inr(s.walletPaise)} l="Wallet balance" />
              <StatCard n={String(s.bottlesPending)} l="Bottles pending" />
              <StatCard n={s.loyaltyPoints.toLocaleString("en-IN")} l="Reward points" />
            </div>

            {s.activeSubscription ? (
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Active subscription</p>
                    <p className="mt-1 font-display text-lg font-semibold text-forest">{s.activeSubscription.planName}</p>
                    <p className="mt-0.5 text-sm text-ink-2">{s.activeSubscription.items.map((i) => `${i.qty} × ${i.product} ${i.label}`).join(", ") || "—"}</p>
                  </div>
                  <StatusPill status={s.activeSubscription.status} />
                </div>
                <Link href="/account/subscription" className="mt-4 inline-block text-sm font-semibold text-leaf-600 hover:underline">Manage subscription →</Link>
              </Card>
            ) : (
              <Card>
                <p className="font-display text-lg font-semibold text-forest">No active subscription</p>
                <p className="mt-1 text-sm text-ink-3">Start a daily-delivery plan to get fresh A2 milk every morning.</p>
                <Link href="/subscriptions" className="mt-4 inline-block rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white hover:bg-leaf-600">Start a subscription</Link>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <QuickLink href="/account/orders" n={s.counts.orders} l="Orders" />
              <QuickLink href="/account/deliveries" n={s.counts.deliveries} l="Deliveries" />
              <QuickLink href="/account/invoices" n={s.counts.invoices} l="Invoices" />
            </div>
          </div>
        )}
      </StateGate>
    </>
  );
}

function QuickLink({ href, n, l }: { href: string; n: number; l: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-mint-soft bg-white p-5 transition hover:border-leaf hover:shadow-sm">
      <div className="font-display text-2xl font-bold text-leaf-600">{n}</div>
      <div className="mt-1 text-sm text-ink-3">{l} →</div>
    </Link>
  );
}
