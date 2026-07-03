"use client";

import { PageHead, StatCard } from "@/components/dashboard/Shell";
import { useResource, StateGate } from "@/components/account/ui";

interface Summary {
  revenueTodayPaise: number; revenueMonthPaise: number;
  activeSubscriptions: number; customers: number; newCustomers: number;
  pendingDeliveries: number; ordersToday: number; products: number; bottlesInField: number;
}

/* Compact INR: ₹1.84L / ₹2.1Cr / ₹4,500 */
function inrCompact(paise: number) {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  return `₹${Math.round(r).toLocaleString("en-IN")}`;
}

export function AdminDashboardView() {
  const { data, state } = useResource<{ summary: Summary }>("/api/admin/summary");
  const s = data?.summary;
  return (
    <>
      <PageHead title="Dashboard" sub="Live overview of operations and revenue." />
      <StateGate state={state}>
        {s && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard n={inrCompact(s.revenueTodayPaise)} l="Today's revenue" />
            <StatCard n={inrCompact(s.revenueMonthPaise)} l="Month revenue" />
            <StatCard n={s.activeSubscriptions.toLocaleString("en-IN")} l="Active subscriptions" />
            <StatCard n={s.pendingDeliveries.toLocaleString("en-IN")} l="Pending deliveries" />
            <StatCard n={s.customers.toLocaleString("en-IN")} l="Total customers" />
            <StatCard n={s.newCustomers.toLocaleString("en-IN")} l="New customers (7d)" />
            <StatCard n={s.ordersToday.toLocaleString("en-IN")} l="Orders today" />
            <StatCard n={s.bottlesInField.toLocaleString("en-IN")} l="Bottles in field" />
          </div>
        )}
      </StateGate>
    </>
  );
}
