"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, apiSend } from "@/components/account/ui";

interface Driver {
  id: string; employeeId: string | null; vehicleNo: string | null; active: boolean; rating: number;
  user: { name: string | null; email: string | null; phone: string | null; status: string };
  deliveries: number;
}
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function DriversBoard() {
  const { data, state, reload } = useResource<{ drivers: Driver[] }>("/api/admin/drivers");
  const drivers = data?.drivers ?? [];
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", employeeId: "", vehicleNo: "", password: "" });
  const [edit, setEdit] = useState({ employeeId: "", vehicleNo: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create"); setErr(null); setErrs({});
    const res = await apiSend("/api/admin/drivers", "POST", { ...draft, phone: draft.phone || undefined, employeeId: draft.employeeId || undefined, vehicleNo: draft.vehicleNo || undefined });
    setBusy(null);
    if (res.ok) { setAdding(false); setDraft({ name: "", email: "", phone: "", employeeId: "", vehicleNo: "", password: "" }); reload(); }
    else { setErr(res.error ?? "Couldn't onboard driver."); if (res.details) setErrs(res.details); }
  }
  async function update(id: string, patch: Record<string, unknown>) {
    const res = await apiSend(`/api/admin/drivers/${id}`, "PATCH", patch);
    if (res.ok) { setEditId(null); reload(); } else alert(res.error);
  }

  return (
    <div className="space-y-4">
      <button onClick={() => { setAdding((a) => !a); setErr(null); setErrs({}); }} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">{adding ? "Close" : "+ Onboard driver"}</button>

      {adding && (
        <Card>
          <h3 className="font-display text-lg font-semibold text-forest">New delivery executive</h3>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Name" error={errs.name}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Email" error={errs.email}><input className={inputCls} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Phone" error={errs.phone}><input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="Employee ID" error={errs.employeeId}><input className={inputCls} value={draft.employeeId} onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })} placeholder="DRV-02" /></Field>
            <Field label="Vehicle no." error={errs.vehicleNo}><input className={inputCls} value={draft.vehicleNo} onChange={(e) => setDraft({ ...draft, vehicleNo: e.target.value })} placeholder="AP16 CD 1234" /></Field>
            <Field label="Temporary password" error={errs.password}><input className={inputCls} type="text" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="8+ chars — reset on first login" /></Field>
            {err && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-600">{err}</p>}
            <div className="sm:col-span-2"><button type="submit" disabled={busy === "create"} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy === "create" ? "Onboarding…" : "Onboard"}</button></div>
          </form>
        </Card>
      )}

      <StateGate state={state}>
        {drivers.length === 0 ? (
          <EmptyState title="No drivers yet" body="Onboard your first delivery executive." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Executive", "Emp. ID", "Vehicle", "Deliveries", "Rating", "Active", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3"><div className="font-semibold text-forest">{d.user.name ?? "—"}</div><div className="text-xs text-ink-3">{d.user.email ?? d.user.phone ?? ""}</div></td>
                    {editId === d.id ? (
                      <>
                        <td className="px-4 py-3"><input className="w-24 rounded-lg border border-mint-soft px-2 py-1 text-xs" value={edit.employeeId} onChange={(e) => setEdit({ ...edit, employeeId: e.target.value })} /></td>
                        <td className="px-4 py-3"><input className="w-28 rounded-lg border border-mint-soft px-2 py-1 text-xs" value={edit.vehicleNo} onChange={(e) => setEdit({ ...edit, vehicleNo: e.target.value })} /></td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono text-xs text-ink-3">{d.employeeId ?? "—"}</td>
                        <td className="px-4 py-3 text-ink-2">{d.vehicleNo ?? "—"}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-ink-2">{d.deliveries}</td>
                    <td className="px-4 py-3 text-ink-2">{d.rating.toFixed(1)}★</td>
                    <td className="px-4 py-3">
                      <button onClick={() => update(d.id, { active: !d.active })} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.active ? "bg-mint-soft text-leaf-600" : "bg-gray-100 text-gray-500"}`}>{d.active ? "Active" : "Inactive"}</button>
                    </td>
                    <td className="px-4 py-3">
                      {editId === d.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => update(d.id, { employeeId: edit.employeeId || null, vehicleNo: edit.vehicleNo || null })} className="font-semibold text-leaf-600 hover:underline">Save</button>
                          <button onClick={() => setEditId(null)} className="font-semibold text-ink-3 hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditId(d.id); setEdit({ employeeId: d.employeeId ?? "", vehicleNo: d.vehicleNo ?? "" }); }} className="font-semibold text-leaf-600 hover:underline">Edit</button>
                      )}
                    </td>
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
