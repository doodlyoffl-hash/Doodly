"use client";

import { useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, EmptyState, StatusPill, fmtDate } from "@/components/account/ui";

interface Order {
  id: string; type: string; status: string; createdAt: string; totalPaise: number;
  user: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  delivery: { status: string; date: string } | null;
  invoice: { number: string } | null;
}
const TYPE_LABEL: Record<string, string> = { SUBSCRIPTION: "Subscription", ONE_TIME: "One-time", EXTRA: "Extra", SAMPLE: "Trial" };
const STATUSES = ["", "PENDING", "PAID", "FAILED", "REFUNDED"];
const selCls = "rounded-xl border border-mint-soft bg-white px-3 py-2 text-sm text-forest outline-none focus:border-leaf";

export function OrdersBoard() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [status, q]);
  const { data, state } = useResource<{ orders: Order[] }>(`/api/admin/orders${query ? `?${query}` : ""}`);
  const orders = data?.orders ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer name, email or phone…" className={`${selCls} min-w-[260px] flex-1`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s[0] + s.slice(1).toLowerCase() : "All statuses"}</option>)}
        </select>
      </div>

      <StateGate state={state}>
        {orders.length === 0 ? (
          <EmptyState title="No orders found" body="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Order", "Customer", "Date", "Type", "Total", "Payment", "Delivery"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 font-mono text-xs text-ink-3">#{o.id.slice(-6).toUpperCase()}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-forest">{o.user?.name ?? "—"}</div>
                      <div className="text-xs text-ink-3">{o.user?.email ?? o.user?.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-3 text-ink-2">{TYPE_LABEL[o.type] ?? o.type}</td>
                    <td className="px-4 py-3 font-semibold text-forest">{inr(o.totalPaise)}</td>
                    <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                    <td className="px-4 py-3">{o.delivery ? <StatusPill status={o.delivery.status} /> : <span className="text-ink-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StateGate>
    </div>
  );
}
