"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, apiSend, fmtDate } from "@/components/account/ui";

interface Block { id: string; key: string; type: string; data: unknown; published: boolean; updatedAt: string }
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function CmsBoard() {
  const { data, state, reload } = useResource<{ blocks: Block[] }>("/api/admin/cms");
  const blocks = data?.blocks ?? [];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState({ key: "", type: "hero", published: true, dataText: "{}" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function openNew() { setDraft({ key: "", type: "hero", published: true, dataText: "{\n  \n}" }); setErr(null); setErrs({}); setEditing("new"); }
  function openEdit(b: Block) { setDraft({ key: b.key, type: b.type, published: b.published, dataText: JSON.stringify(b.data ?? {}, null, 2) }); setErr(null); setErrs({}); setEditing(b.id); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setErrs({});
    let parsed: unknown;
    try { parsed = JSON.parse(draft.dataText || "{}"); } catch { setErr("The data field is not valid JSON."); return; }
    setBusy(true);
    const isNew = editing === "new";
    const body = isNew ? { key: draft.key, type: draft.type, published: draft.published, data: parsed } : { type: draft.type, published: draft.published, data: parsed };
    const res = isNew ? await apiSend("/api/admin/cms", "POST", body) : await apiSend(`/api/admin/cms/${editing}`, "PATCH", body);
    setBusy(false);
    if (res.ok) { setEditing(null); reload(); }
    else { setErr(res.error ?? "Couldn't save."); if (res.details) setErrs(res.details); }
  }
  async function togglePub(b: Block) { if ((await apiSend(`/api/admin/cms/${b.id}`, "PATCH", { published: !b.published })).ok) reload(); }
  async function remove(b: Block) { if (confirm(`Delete block “${b.key}”?`) && (await apiSend(`/api/admin/cms/${b.id}`, "DELETE")).ok) reload(); }

  return (
    <StateGate state={state}>
      <div className="space-y-4">
        {blocks.length === 0 && editing === null && <EmptyState title="No content blocks" body="Create your first CMS block." />}

        {blocks.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Key", "Type", "Published", "Updated", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 font-mono text-xs text-forest">{b.key}</td>
                    <td className="px-4 py-3 text-ink-2">{b.type}</td>
                    <td className="px-4 py-3"><button onClick={() => togglePub(b)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.published ? "bg-mint-soft text-leaf-600" : "bg-gray-100 text-gray-500"}`}>{b.published ? "Live" : "Draft"}</button></td>
                    <td className="px-4 py-3 text-ink-3">{fmtDate(b.updatedAt)}</td>
                    <td className="px-4 py-3"><div className="flex gap-3"><button onClick={() => openEdit(b)} className="font-semibold text-leaf-600 hover:underline">Edit</button><button onClick={() => remove(b)} className="font-semibold text-red-600 hover:underline">Delete</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing !== null ? (
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">{editing === "new" ? "New block" : "Edit block"}</h3>
            <form onSubmit={save} className="mt-4 space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Key" error={errs.key}><input className={inputCls} value={draft.key} disabled={editing !== "new"} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="hero" /></Field>
                <Field label="Type" error={errs.type}><input className={inputCls} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} placeholder="hero / banner / faq" /></Field>
                <Field label="Published"><label className="flex items-center gap-2 py-2 text-sm text-ink-2"><input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} /> Live on the site</label></Field>
              </div>
              <Field label="Data (JSON)"><textarea className={`${inputCls} font-mono`} rows={8} value={draft.dataText} onChange={(e) => setDraft({ ...draft, dataText: e.target.value })} /></Field>
              {err && <p role="alert" className="text-sm font-semibold text-red-600">{err}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={busy} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy ? "Saving…" : "Save block"}</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Cancel</button>
              </div>
            </form>
          </Card>
        ) : (
          <button onClick={openNew} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">+ New block</button>
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
