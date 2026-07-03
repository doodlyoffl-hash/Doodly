"use client";

import { useState } from "react";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, Card, EmptyState, apiSend } from "@/components/account/ui";

interface Farmer { id: string; name: string; phone: string; village: string; ratePerLitre: number; active: boolean; procurements: number }
type Draft = { name: string; phone: string; village: string; rate: string };
const empty: Draft = { name: "", phone: "", village: "", rate: "" };
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function FarmersBoard() {
  const { data, state, reload } = useResource<{ farmers: Farmer[] }>("/api/admin/farmers");
  const farmers = data?.farmers ?? [];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function openNew() { setDraft(empty); setErr(null); setErrs({}); setEditing("new"); }
  function openEdit(f: Farmer) { setDraft({ name: f.name, phone: f.phone, village: f.village, rate: String(f.ratePerLitre / 100) }); setErr(null); setErrs({}); setEditing(f.id); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save"); setErr(null); setErrs({});
    const body = { name: draft.name, phone: draft.phone, village: draft.village, ratePerLitre: Math.round(parseFloat(draft.rate || "0") * 100) };
    const res = editing === "new" ? await apiSend("/api/admin/farmers", "POST", body) : await apiSend(`/api/admin/farmers/${editing}`, "PATCH", body);
    setBusy(null);
    if (res.ok) { setEditing(null); reload(); }
    else { setErr(res.error ?? "Couldn't save."); if (res.details) setErrs(res.details); }
  }
  async function toggle(f: Farmer) { if ((await apiSend(`/api/admin/farmers/${f.id}`, "PATCH", { active: !f.active })).ok) reload(); }
  async function remove(f: Farmer) { if (confirm(`Delete ${f.name}?`)) { const res = await apiSend(`/api/admin/farmers/${f.id}`, "DELETE"); if (res.ok) reload(); else alert(res.error); } }

  return (
    <StateGate state={state}>
      <div className="space-y-4">
        {farmers.length === 0 && editing === null && <EmptyState title="No farmers yet" body="Add the dairy families who supply your milk." />}

        {farmers.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Farmer", "Village", "Phone", "Rate / litre", "Collections", "Active", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {farmers.map((f) => (
                  <tr key={f.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 font-semibold text-forest">{f.name}</td>
                    <td className="px-4 py-3 text-ink-2">{f.village}</td>
                    <td className="px-4 py-3 text-ink-3">{f.phone}</td>
                    <td className="px-4 py-3 font-semibold text-forest">{inr(f.ratePerLitre)}</td>
                    <td className="px-4 py-3 text-ink-2">{f.procurements}</td>
                    <td className="px-4 py-3"><button onClick={() => toggle(f)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.active ? "bg-mint-soft text-leaf-600" : "bg-gray-100 text-gray-500"}`}>{f.active ? "Active" : "Inactive"}</button></td>
                    <td className="px-4 py-3"><div className="flex gap-3"><button onClick={() => openEdit(f)} className="font-semibold text-leaf-600 hover:underline">Edit</button><button onClick={() => remove(f)} className="font-semibold text-red-600 hover:underline">Delete</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing !== null ? (
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">{editing === "new" ? "New farmer" : "Edit farmer"}</h3>
            <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Name" error={errs.name}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Phone" error={errs.phone}><input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+91…" /></Field>
              <Field label="Village" error={errs.village}><input className={inputCls} value={draft.village} onChange={(e) => setDraft({ ...draft, village: e.target.value })} /></Field>
              <Field label="Rate per litre (₹)" error={errs.ratePerLitre}><input className={inputCls} type="number" step="0.01" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} placeholder="62" /></Field>
              {err && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-600">{err}</p>}
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={busy === "save"} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy === "save" ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Cancel</button>
              </div>
            </form>
          </Card>
        ) : (
          <button onClick={openNew} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">+ New farmer</button>
        )}
      </div>
    </StateGate>
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
