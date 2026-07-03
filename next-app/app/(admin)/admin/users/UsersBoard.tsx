"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, StatusPill, apiSend, fmtDate } from "@/components/account/ui";

interface User {
  id: string; name: string | null; email: string | null; phone: string | null;
  role: string; status: string; createdAt: string;
}
const ROLES: [string, string][] = [
  ["customer", "Customer"], ["delivery_executive", "Delivery Executive"], ["support", "Customer Support"],
  ["operations", "Operations Manager"], ["procurement", "Procurement Manager"], ["accountant", "Accountant"],
  ["inventory", "Inventory Manager"], ["quality", "Quality Manager"], ["marketing", "Marketing Manager"],
  ["admin", "Admin"], ["super_admin", "Super Admin"],
];
const STATUSES = ["ACTIVE", "DISABLED", "LOCKED"];
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";
const cellSel = "rounded-lg border border-mint-soft bg-white px-2 py-1 text-xs text-forest";

type Draft = { name: string; email: string; phone: string; role: string; password: string };
const empty: Draft = { name: "", email: "", phone: "", role: "support", password: "" };

export function UsersBoard() {
  const [roleFilter, setRoleFilter] = useState("");
  const [q, setQ] = useState("");
  const params = new URLSearchParams();
  if (roleFilter) params.set("role", roleFilter);
  if (q.trim()) params.set("q", q.trim());
  const { data, state, reload } = useResource<{ users: User[] }>(`/api/users${params.toString() ? `?${params}` : ""}`);
  const users = data?.users ?? [];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setErrs({});
    const res = await apiSend("/api/users", "POST", { name: draft.name, email: draft.email, phone: draft.phone || undefined, role: draft.role, password: draft.password });
    setBusy(false);
    if (res.ok) { setAdding(false); setDraft(empty); reload(); }
    else { setErr(res.error ?? "Couldn't create user."); if (res.details) setErrs(res.details); }
  }
  async function update(u: User, patch: Record<string, unknown>) {
    const res = await apiSend(`/api/users/${u.id}`, "PATCH", patch);
    if (res.ok) reload(); else alert(res.error);
  }
  async function disable(u: User) {
    if (confirm(`Disable ${u.name ?? u.email}? They will no longer be able to sign in.`) && (await apiSend(`/api/users/${u.id}`, "DELETE")).ok) reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className={`${inputCls} min-w-[240px] flex-1`} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputCls + " max-w-[220px]"}>
          <option value="">All roles</option>
          {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button onClick={() => { setAdding((a) => !a); setErr(null); setErrs({}); }} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">{adding ? "Close" : "+ Add user"}</button>
      </div>

      {adding && (
        <Card>
          <h3 className="font-display text-lg font-semibold text-forest">New staff account</h3>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Name" error={errs.name}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Email" error={errs.email}><input className={inputCls} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Phone" error={errs.phone}><input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <Field label="Role">
              <select className={inputCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Temporary password" error={errs.password} full><input className={inputCls} type="text" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="At least 8 characters — they'll reset on first login" /></Field>
            {err && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-600">{err}</p>}
            <div className="sm:col-span-2"><button type="submit" disabled={busy} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy ? "Creating…" : "Create user"}</button></div>
          </form>
        </Card>
      )}

      <StateGate state={state}>
        {users.length === 0 ? (
          <EmptyState title="No users found" body="Try a different filter or add a new user." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["User", "Role", "Status", "Joined", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleKey = u.role.toLowerCase();
                  return (
                    <tr key={u.id} className="border-b border-mint-soft/60">
                      <td className="px-4 py-3"><div className="font-semibold text-forest">{u.name ?? "—"}</div><div className="text-xs text-ink-3">{u.email ?? u.phone ?? ""}</div></td>
                      <td className="px-4 py-3">
                        <select value={roleKey} onChange={(e) => update(u, { role: e.target.value })} className={cellSel}>
                          {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select value={u.status} onChange={(e) => update(u, { status: e.target.value })} className={cellSel}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-ink-3">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3"><button onClick={() => disable(u)} className="font-semibold text-red-600 hover:underline">Disable</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </StateGate>
    </div>
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
