"use client";

import { StatCard } from "@/components/dashboard/Shell";
import { useResource, StateGate, Card } from "@/components/account/ui";

interface Report {
  revenue: { totalPaise: number; monthPaise: number };
  orders: { byStatus: Record<string, number>; total: number };
  subscriptions: { byStatus: Record<string, number>; total: number };
  deliveries: { total: number; delivered: number; pending: number };
  customers: { total: number; newThisWeek: number };
  procurement: { batches: number; litres: number; payablePaise: number };
}
function inrCompact(p: number) {
  const r = p / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  return `₹${Math.round(r).toLocaleString("en-IN")}`;
}

export function ReportsView() {
  const { data, state } = useResource<{ report: Report }>("/api/admin/reports");
  const r = data?.report;

  function exportCsv() {
    if (!r) return;
    const lines = [
      ["Metric", "Value"],
      ["Revenue (total)", inrCompact(r.revenue.totalPaise)],
      ["Revenue (month)", inrCompact(r.revenue.monthPaise)],
      ["Orders (total)", r.orders.total],
      ...Object.entries(r.orders.byStatus).map(([k, v]) => [`Orders · ${k}`, v]),
      ["Subscriptions (total)", r.subscriptions.total],
      ...Object.entries(r.subscriptions.byStatus).map(([k, v]) => [`Subscriptions · ${k}`, v]),
      ["Deliveries (total)", r.deliveries.total],
      ["Deliveries · delivered", r.deliveries.delivered],
      ["Deliveries · pending", r.deliveries.pending],
      ["Customers (total)", r.customers.total],
      ["Customers · new this week", r.customers.newThisWeek],
      ["Procurement · batches", r.procurement.batches],
      ["Procurement · litres", r.procurement.litres],
      ["Procurement · payable", inrCompact(r.procurement.payablePaise)],
    ];
    const csv = lines.map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "doodly-report.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <StateGate state={state}>
      {r && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={exportCsv} className="rounded-full border border-mint-soft px-5 py-2 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Export CSV</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard n={inrCompact(r.revenue.totalPaise)} l="Total revenue" />
            <StatCard n={inrCompact(r.revenue.monthPaise)} l="Revenue this month" />
            <StatCard n={r.customers.total.toLocaleString("en-IN")} l="Customers" />
            <StatCard n={`${r.deliveries.delivered}/${r.deliveries.total}`} l="Deliveries done" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title={`Orders (${r.orders.total})`} rows={r.orders.byStatus} />
            <Breakdown title={`Subscriptions (${r.subscriptions.total})`} rows={r.subscriptions.byStatus} />
          </div>

          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">Procurement</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3 text-sm">
              <Kv k="Batches collected" v={String(r.procurement.batches)} />
              <Kv k="Litres collected" v={`${r.procurement.litres.toLocaleString("en-IN")} L`} />
              <Kv k="Payable to farmers" v={inrCompact(r.procurement.payablePaise)} />
            </div>
          </Card>
        </div>
      )}
    </StateGate>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows);
  return (
    <Card>
      <h3 className="font-display text-lg font-semibold text-forest">{title}</h3>
      {entries.length === 0 ? <p className="mt-2 text-sm text-ink-3">No data yet.</p> : (
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-b border-mint-soft/60 last:border-0">
                <td className="py-2 text-ink-2">{k[0] + k.slice(1).toLowerCase().replace(/_/g, " ")}</td>
                <td className="py-2 text-right font-semibold text-forest">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
function Kv({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-[#F6FAF6] px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{k}</p><p className="mt-0.5 font-display text-lg font-bold text-forest">{v}</p></div>;
}
