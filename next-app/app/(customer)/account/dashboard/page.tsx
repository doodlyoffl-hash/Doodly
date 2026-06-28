import { PageHead, StatCard } from "@/components/dashboard/Shell";

export default function CustomerDashboard() {
  return (
    <>
      <PageHead title="Good morning, Ananya 👋" sub="Here's everything about your milk today." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard n="Tomorrow 6:40 AM" l="Next delivery" />
        <StatCard n="₹480" l="Wallet balance" />
        <StatCard n="2" l="Bottles pending" />
        <StatCard n="1,240" l="Reward points" />
      </div>
    </>
  );
}
