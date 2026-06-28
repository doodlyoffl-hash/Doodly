import { PageHead, StatCard } from "@/components/dashboard/Shell";

export default function DriverDashboard() {
  return (
    <>
      <PageHead title="Good morning, Ramesh 🌅" sub="Route RT-JH-01 · Jubilee Hills · 42 stops today." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard n="42" l="Stops today" />
        <StatCard n="38" l="Delivered" />
        <StatCard n="₹2,140" l="Cash to collect" />
        <StatCard n="31" l="Bottles to pick up" />
      </div>
    </>
  );
}
