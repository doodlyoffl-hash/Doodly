import { PageHead, StatCard } from "@/components/dashboard/Shell";

export default function AdminDashboard() {
  const kpis = [
    ["₹1.84L", "Today's revenue"], ["1,284", "Active subscriptions"],
    ["27", "New customers"], ["312", "Pending deliveries"],
    ["1,940 L", "Milk procured (wk)"], ["418", "Bottles in field"],
    ["4.8★", "Avg delivery rating"], ["₹2.1Cr", "Month revenue"],
  ];
  return (
    <>
      <PageHead title="Dashboard" sub="Live overview of operations and revenue." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([n, l]) => <StatCard key={l} n={n} l={l} />)}
      </div>
    </>
  );
}
