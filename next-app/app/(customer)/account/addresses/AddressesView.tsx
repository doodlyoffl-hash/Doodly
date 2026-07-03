"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, apiSend } from "@/components/account/ui";

interface Address {
  id: string; label: string; line1: string; line2: string | null;
  city: string; pincode: string; deliveryNote: string | null; isDefault: boolean;
}
type Draft = { label: string; line1: string; line2: string; city: string; pincode: string; deliveryNote: string };
const empty: Draft = { label: "Home", line1: "", line2: "", city: "Vijayawada", pincode: "", deliveryNote: "" };
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function AddressesView() {
  const { data, state, reload } = useResource<{ addresses: Address[] }>("/api/addresses");
  const addresses = data?.addresses ?? [];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  function openNew() { setDraft(empty); setErrs({}); setErr(null); setEditing("new"); }
  function openEdit(a: Address) {
    setDraft({ label: a.label, line1: a.line1, line2: a.line2 ?? "", city: a.city, pincode: a.pincode, deliveryNote: a.deliveryNote ?? "" });
    setErrs({}); setErr(null); setEditing(a.id);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrs({}); setErr(null);
    const body = { ...draft, line2: draft.line2 || undefined, deliveryNote: draft.deliveryNote || undefined };
    const res = editing === "new"
      ? await apiSend("/api/addresses", "POST", body)
      : await apiSend(`/api/addresses/${editing}`, "PATCH", body);
    setBusy(false);
    if (res.ok) { setEditing(null); reload(); }
    else { setErr(res.error ?? "Couldn't save address."); if (res.details) setErrs(res.details); }
  }

  async function remove(id: string) {
    const res = await apiSend(`/api/addresses/${id}`, "DELETE");
    if (res.ok) reload();
  }
  async function makeDefault(id: string) {
    const res = await apiSend(`/api/addresses/${id}`, "PATCH", { isDefault: true });
    if (res.ok) reload();
  }

  return (
    <StateGate state={state} signedOutTitle="Sign in to manage addresses" signedOutBody="Your saved delivery addresses appear here once you're signed in.">
      <div className="space-y-4">
        {addresses.length === 0 && editing === null && (
          <EmptyState title="No addresses saved" body="Add a delivery address so we know where to bring your milk." />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-mint-soft px-2.5 py-0.5 text-xs font-bold text-leaf-600">{a.label}</span>
                {a.isDefault && <span className="text-xs font-semibold text-leaf-600">Default</span>}
              </div>
              <p className="mt-2 text-sm text-forest">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
              <p className="text-sm text-ink-2">{a.city} — {a.pincode}</p>
              {a.deliveryNote && <p className="mt-1 text-xs italic text-ink-3">“{a.deliveryNote}”</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <button onClick={() => openEdit(a)} className="font-semibold text-leaf-600 hover:underline">Edit</button>
                {!a.isDefault && <button onClick={() => makeDefault(a.id)} className="font-semibold text-ink-2 hover:underline">Set default</button>}
                {!a.isDefault && <button onClick={() => remove(a.id)} className="font-semibold text-red-600 hover:underline">Delete</button>}
              </div>
            </Card>
          ))}
        </div>

        {editing !== null ? (
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">{editing === "new" ? "Add a new address" : "Edit address"}</h3>
            <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Label"><input className={inputCls} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Home / Office" /></Field>
              <Field label="Pincode" error={errs.pincode}><input className={inputCls} value={draft.pincode} onChange={(e) => setDraft({ ...draft, pincode: e.target.value })} placeholder="520010" inputMode="numeric" /></Field>
              <Field label="Address line 1" error={errs.line1} full><input className={inputCls} value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} placeholder="Flat / house no., street" /></Field>
              <Field label="Address line 2" full><input className={inputCls} value={draft.line2} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} placeholder="Area, landmark (optional)" /></Field>
              <Field label="City" error={errs.city}><input className={inputCls} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></Field>
              <Field label="Delivery note" full><input className={inputCls} value={draft.deliveryNote} onChange={(e) => setDraft({ ...draft, deliveryNote: e.target.value })} placeholder="Leave at the door, gate code…" /></Field>
              {err && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-600">{err}</p>}
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={busy} aria-busy={busy} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy ? "Saving…" : "Save address"}</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Cancel</button>
              </div>
            </form>
          </Card>
        ) : (
          <button onClick={openNew} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">+ Add address</button>
        )}
      </div>
    </StateGate>
  );
}

function Field({ label, error, full, children }: { label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-sm font-semibold text-forest">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
