"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, apiSend, fmtDate } from "@/components/account/ui";

interface Route {
  id: string; name: string; date: string; stops: number;
  driver: { id: string; employeeId: string | null; user: { name: string | null } } | null;
}
interface Driver { id: string; employeeId: string | null; user: { name: string | null } }
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function RoutesBoard() {
  const { data, state, reload } = useResource<{ routes: Route[] }>("/api/admin/routes");
  const drivers = useResource<{ drivers: Driver[] }>("/api/admin/drivers");
  const routes = data?.routes ?? [];
  const driverList = drivers.data?.drivers ?? [];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", date: "", driverId: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create"); setErr(null); setErrs({});
    const res = await apiSend("/api/admin/routes", "POST", { name: draft.name, date: draft.date ? new Date(draft.date).toISOString() : undefined, driverId: draft.driverId || undefined });
    setBusy(null);
    if (res.ok) { setAdding(false); setDraft({ name: "", date: "", driverId: "" }); reload(); }
    else { setErr(res.error ?? "Couldn't create route."); if (res.details) setErrs(res.details); }
  }
  async function reassign(id: string, driverId: string) {
    setBusy(id);
    const res = await apiSend(`/api/admin/routes/${id}`, "PATCH", { driverId: driverId || null });
    setBusy(null);
    if (res.ok) reload(); else alert(res.error);
  }
  async function remove(r: Route) { if (confirm(`Delete route “${r.name}”? Its stops will be unassigned.`) && (await apiSend(`/api/admin/routes/${r.id}`, "DELETE")).ok) reload(); }

  return (
    <div className="space-y-4">
      <button onClick={() => { setAdding((a) => !a); setErr(null); setErrs({}); }} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">{adding ? "Close" : "+ New route"}</button>

      {adding && (
        <Card>
          <h3 className="font-display text-lg font-semibold text-forest">New route</h3>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-3" noValidate>
            <Field label="Name" error={errs.name}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="RT-VJ-02 · Benz Circle" /></Field>
            <Field label="Date"><input className={inputCls} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
            <Field label="Driver">
              <select className={inputCls} value={draft.driverId} onChange={(e) => setDraft({ ...draft, driverId: e.target.value })}>
                <option value="">— Unassigned —</option>
                {driverList.map((d) => <option key={d.id} value={d.id}>{d.user.name ?? d.employeeId ?? "Driver"}</option>)}
              </select>
            </Field>
            {err && <p role="alert" className="sm:col-span-3 text-sm font-semibold text-red-600">{err}</p>}
            <div className="sm:col-span-3"><button type="submit" disabled={busy === "create"} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy === "create" ? "Creating…" : "Create route"}</button></div>
          </form>
        </Card>
      )}

      <StateGate state={state}>
        {routes.length === 0 ? (
          <EmptyState title="No routes yet" body="Create your first delivery route." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Route", "Date", "Stops", "Driver", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 font-semibold text-forest">{r.name}</td>
                    <td className="px-4 py-3 text-ink-2">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-ink-2">{r.stops}</td>
                    <td className="px-4 py-3">
                      <select value={r.driver?.id ?? ""} disabled={busy === r.id} onChange={(e) => reassign(r.id, e.target.value)} className="rounded-lg border border-mint-soft bg-white px-2 py-1 text-xs text-forest">
                        <option value="">— Unassigned —</option>
                        {driverList.map((d) => <option key={d.id} value={d.id}>{d.user.name ?? d.employeeId ?? "Driver"}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3"><button onClick={() => remove(r)} className="font-semibold text-red-600 hover:underline">Delete</button></td>
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-forest">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
