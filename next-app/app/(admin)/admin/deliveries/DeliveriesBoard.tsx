"use client";

import { useMemo, useState } from "react";
import { useResource, StateGate, EmptyState, StatusPill, apiSend, fmtDay } from "@/components/account/ui";

interface Delivery {
  id: string; date: string; status: string; slot: string | null; sequence: number | null;
  bottlesIn: number; cashCollected: number; bottleCount: number;
  customer: string; area: string;
  driver: { id: string; name: string | null; employeeId: string | null } | null;
}
interface Driver { id: string; employeeId: string | null; user: { name: string | null } }
const WHEN = [["", "All dates"], ["today", "Today"], ["upcoming", "Upcoming"], ["past", "Past"]];
const STATUSES = ["", "SCHEDULED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "SKIPPED"];
const selCls = "rounded-xl border border-mint-soft bg-white px-3 py-2 text-sm text-forest outline-none focus:border-leaf";

export function DeliveriesBoard() {
  const [when, setWhen] = useState("today");
  const [status, setStatus] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (when) p.set("when", when);
    if (status) p.set("status", status);
    return p.toString();
  }, [when, status]);
  const { data, state, reload } = useResource<{ deliveries: Delivery[] }>(`/api/admin/deliveries${query ? `?${query}` : ""}`);
  const drivers = useResource<{ drivers: Driver[] }>("/api/admin/drivers");
  const deliveries = data?.deliveries ?? [];
  const driverList = drivers.data?.drivers ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  async function assign(id: string, driverId: string) {
    setBusy(id);
    const res = await apiSend(`/api/admin/deliveries/${id}`, "PATCH", { driverId: driverId || null });
    setBusy(null);
    if (res.ok) reload(); else alert(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select value={when} onChange={(e) => setWhen(e.target.value)} className={selCls}>{WHEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls}>{STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ").toLowerCase() : "All statuses"}</option>)}</select>
      </div>

      <StateGate state={state}>
        {deliveries.length === 0 ? (
          <EmptyState title="No deliveries" body="Try a different date or status filter." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Date", "Customer", "Area", "Slot", "Driver", "Status"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 text-ink-2">{fmtDay(d.date)}</td>
                    <td className="px-4 py-3 font-semibold text-forest">{d.customer}</td>
                    <td className="px-4 py-3 text-ink-3">{d.area}</td>
                    <td className="px-4 py-3 text-ink-2">{d.slot ?? "6–8 AM"}</td>
                    <td className="px-4 py-3">
                      <select value={d.driver?.id ?? ""} disabled={busy === d.id} onChange={(e) => assign(d.id, e.target.value)} className="rounded-lg border border-mint-soft bg-white px-2 py-1 text-xs text-forest">
                        <option value="">— Unassigned —</option>
                        {driverList.map((dr) => <option key={dr.id} value={dr.id}>{dr.user.name ?? dr.employeeId ?? "Driver"}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={d.status} /></td>
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
