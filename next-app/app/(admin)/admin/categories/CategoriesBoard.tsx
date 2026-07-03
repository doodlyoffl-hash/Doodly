"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, apiSend } from "@/components/account/ui";

interface Category {
  id: string; slug: string; name: string; description: string | null;
  sortOrder: number; active: boolean; _count: { products: number };
}
type Draft = { slug: string; name: string; description: string; sortOrder: number; active: boolean };
const empty: Draft = { slug: "", name: "", description: "", sortOrder: 0, active: true };
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function CategoriesBoard() {
  const { data, state, reload } = useResource<{ categories: Category[] }>("/api/categories");
  const categories = data?.categories ?? [];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function openNew() { setDraft(empty); setErr(null); setErrs({}); setEditing("new"); }
  function openEdit(c: Category) { setDraft({ slug: c.slug, name: c.name, description: c.description ?? "", sortOrder: c.sortOrder, active: c.active }); setErr(null); setErrs({}); setEditing(c.id); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setErrs({});
    const isNew = editing === "new";
    const body = isNew
      ? { slug: draft.slug, name: draft.name, description: draft.description || undefined, sortOrder: draft.sortOrder, active: draft.active }
      : { name: draft.name, description: draft.description || undefined, sortOrder: draft.sortOrder, active: draft.active };
    const res = isNew ? await apiSend("/api/categories", "POST", body) : await apiSend(`/api/categories/${editing}`, "PATCH", body);
    setBusy(false);
    if (res.ok) { setEditing(null); reload(); }
    else { setErr(res.error ?? "Couldn't save."); if (res.details) setErrs(res.details); }
  }
  async function toggle(c: Category) { if ((await apiSend(`/api/categories/${c.id}`, "PATCH", { active: !c.active })).ok) reload(); }
  async function remove(c: Category) {
    if (!confirm(`Delete category “${c.name}”?`)) return;
    const res = await apiSend(`/api/categories/${c.id}`, "DELETE");
    if (res.ok) reload(); else alert(res.error);
  }

  return (
    <StateGate state={state}>
      <div className="space-y-4">
        {categories.length === 0 && editing === null && <EmptyState title="No categories yet" body="Create your first category to group products." />}

        {categories.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Name", "Slug", "Products", "Order", "Active", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 font-semibold text-forest">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-3">{c.slug}</td>
                    <td className="px-4 py-3 text-ink-2">{c._count.products}</td>
                    <td className="px-4 py-3 text-ink-2">{c.sortOrder}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(c)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.active ? "bg-mint-soft text-leaf-600" : "bg-gray-100 text-gray-500"}`}>{c.active ? "Active" : "Hidden"}</button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(c)} className="font-semibold text-leaf-600 hover:underline">Edit</button>
                        <button onClick={() => remove(c)} className="font-semibold text-red-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing !== null ? (
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">{editing === "new" ? "New category" : "Edit category"}</h3>
            <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Name" error={errs.name}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Slug" error={errs.slug}>
                <input className={inputCls} value={draft.slug} disabled={editing !== "new"} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="milk" />
              </Field>
              <Field label="Description" full><input className={inputCls} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
              <Field label="Sort order"><input className={inputCls} type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field>
              <Field label="Active">
                <label className="flex items-center gap-2 py-2 text-sm text-ink-2"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Visible in storefront</label>
              </Field>
              {err && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-600">{err}</p>}
              <div className="sm:col-span-2 flex gap-3">
                <button type="submit" disabled={busy} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Cancel</button>
              </div>
            </form>
          </Card>
        ) : (
          <button onClick={openNew} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">+ New category</button>
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
