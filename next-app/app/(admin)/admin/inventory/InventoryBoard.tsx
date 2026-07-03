"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, apiSend } from "@/components/account/ui";

interface Item { id: string; sku: string; name: string; unit: string; quantity: number; reorderAt: number }
type Draft = { sku: string; name: string; unit: string; quantity: number; reorderAt: number };
const empty: Draft = { sku: "", name: "", unit: "piece", quantity: 0, reorderAt: 0 };
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function InventoryBoard() {
  const { data, state, reload } = useResource<{ items: Item[] }>("/api/admin/inventory");
  const items = data?.items ?? [];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function openNew() { setDraft(empty); setErr(null); setErrs({}); setEditing("new"); }
  function openEdit(it: Item) { setDraft({ sku: it.sku, name: it.name, unit: it.unit, quantity: it.quantity, reorderAt: it.reorderAt }); setErr(null); setErrs({}); setEditing(it.id); }

  async function adjust(it: Item, delta: number) {
    setBusy(it.id);
    const res = await apiSend(`/api/admin/inventory/${it.id}`, "PATCH", { quantity: Math.max(0, it.quantity + delta) });
    setBusy(null);
    if (res.ok) reload(); else alert(res.error);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save"); setErr(null); setErrs({});
    const isNew = editing === "new";
    const body = isNew ? draft : { name: draft.name, unit: draft.unit, quantity: draft.quantity, reorderAt: draft.reorderAt };
    const res = isNew ? await apiSend("/api/admin/inventory", "POST", body) : await apiSend(`/api/admin/inventory/${editing}`, "PATCH", body);
    setBusy(null);
    if (res.ok) { setEditing(null); reload(); }
    else { setErr(res.error ?? "Couldn't save."); if (res.details) setErrs(res.details); }
  }
  async function remove(it: Item) { if (confirm(`Delete ${it.name}?`) && (await apiSend(`/api/admin/inventory/${it.id}`, "DELETE")).ok) reload(); }

  return (
    <StateGate state={state}>
      <div className="space-y-4">
        {items.length === 0 && editing === null && <EmptyState title="No inventory items" body="Add raw materials and supplies to track stock." />}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["SKU", "Item", "On hand", "Reorder at", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const low = it.quantity <= it.reorderAt;
                  return (
                    <tr key={it.id} className="border-b border-mint-soft/60">
                      <td className="px-4 py-3 font-mono text-xs text-ink-3">{it.sku}</td>
                      <td className="px-4 py-3 font-semibold text-forest">{it.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => adjust(it, -10)} disabled={busy === it.id} className="grid h-6 w-6 place-items-center rounded-full border border-mint-soft text-ink-2 hover:bg-[#F6FAF6]">−</button>
                          <span className="min-w-[64px] text-center font-semibold text-forest">{it.quantity.toLocaleString("en-IN")} {it.unit}</span>
                          <button onClick={() => adjust(it, 10)} disabled={busy === it.id} className="grid h-6 w-6 place-items-center rounded-full border border-mint-soft text-ink-2 hover:bg-[#F6FAF6]">+</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-2">{it.reorderAt.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${low ? "bg-amber-50 text-amber-700" : "bg-mint-soft text-leaf-600"}`}>{low ? "Reorder" : "In stock"}</span></td>
                      <td className="px-4 py-3"><div className="flex gap-3"><button onClick={() => openEdit(it)} className="font-semibold text-leaf-600 hover:underline">Edit</button><button onClick={() => remove(it)} className="font-semibold text-red-600 hover:underline">Delete</button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {editing !== null ? (
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">{editing === "new" ? "New item" : "Edit item"}</h3>
            <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="SKU" error={errs.sku}><input className={inputCls} value={draft.sku} disabled={editing !== "new"} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="BOTTLE_1L" /></Field>
              <Field label="Name" error={errs.name}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Unit" error={errs.unit}><input className={inputCls} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="piece / litre" /></Field>
              <Field label="On hand" error={errs.quantity}><input className={inputCls} type="number" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} /></Field>
              <Field label="Reorder at"><input className={inputCls} type="number" value={draft.reorderAt} onChange={(e) => setDraft({ ...draft, reorderAt: Number(e.target.value) })} /></Field>
              {err && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-600">{err}</p>}
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={busy === "save"} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy === "save" ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Cancel</button>
              </div>
            </form>
          </Card>
        ) : (
          <button onClick={openNew} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">+ New item</button>
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
