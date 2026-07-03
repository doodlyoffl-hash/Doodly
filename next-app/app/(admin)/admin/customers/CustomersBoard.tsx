"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomerListItem, CustomerListResponse, CustomerStats, CustomerProfile, CustomerReports } from "@/lib/customers/types";

/* ---------- shared helpers ---------- */
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDT = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const sel = "rounded-lg border border-mint-soft bg-white px-3 py-2 text-sm outline-none focus:border-leaf";
const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm outline-none focus:border-leaf";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

const ST_TONE: Record<string, string> = { ACTIVE: "bg-leaf text-white", DISABLED: "bg-gray-100 text-gray-500", LOCKED: "bg-red-50 text-red-700" };
const TYPE_TONE: Record<string, string> = { SUBSCRIPTION: "bg-leaf/10 text-leaf-600", TRIAL: "bg-amber-50 text-amber-700", REGULAR: "bg-blue-50 text-blue-700", NEW: "bg-gray-100 text-gray-500" };
const Pill = ({ s, map }: { s: string; map: Record<string, string> }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${map[s] ?? "bg-gray-100 text-gray-600"}`}>{s[0] + s.slice(1).toLowerCase()}</span>;
const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl border border-mint-soft bg-white p-5"><div className="font-display text-2xl font-bold text-leaf-600">{value}</div><div className="mt-1 text-sm text-ink-3">{label}</div>{sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}</div>
);
function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="relative rounded-2xl border border-mint-soft bg-white p-4"><div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h4>{right}</div>{children}</div>;
}

type Tab = "dashboard" | "customers" | "reports";
const TABS: { key: Tab; label: string }[] = [{ key: "dashboard", label: "Dashboard" }, { key: "customers", label: "Customers" }, { key: "reports", label: "Reports" }];

export function CustomersBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t.label}</button>)}
      </div>
      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "customers" && <CustomersTab flash={flash} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================= Dashboard ============================= */
function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [s, setS] = useState<CustomerStats | null>(null);
  useEffect(() => { api("/api/admin/customers/stats").then(setS).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!s) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Total customers" value={String(s.total)} sub={`${s.newThisMonth} new this month`} />
      <Kpi label="Active" value={String(s.active)} />
      <Kpi label="Inactive" value={String(s.inactive)} />
      <Kpi label="Subscription customers" value={String(s.subscription)} />
      <Kpi label="Trial customers" value={String(s.trial)} />
      <Kpi label="Paused subscriptions" value={String(s.pausedSubscriptions)} />
      <Kpi label="Awaiting verification" value={String(s.awaitingVerification)} />
      <Kpi label="Pending payments" value={String(s.pendingPayments)} />
    </div>
  );
}

/* ============================= Customers list ============================= */
function CustomersTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [plan, setPlan] = useState("");
  const [zone, setZone] = useState("");
  const [pincode, setPincode] = useState("");
  const [walletMin, setWalletMin] = useState("");
  const [regFrom, setRegFrom] = useState("");
  const [regTo, setRegTo] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (type) p.set("type", type);
    if (plan) p.set("plan", plan);
    if (zone) p.set("zone", zone);
    if (pincode.trim()) p.set("pincode", pincode.trim());
    if (walletMin) p.set("walletMin", String(Math.round(Number(walletMin) * 100)));
    if (regFrom) p.set("regFrom", regFrom);
    if (regTo) p.set("regTo", regTo);
    p.set("sort", sort); p.set("page", String(page)); p.set("pageSize", "15");
    return `/api/admin/customers?${p.toString()}`;
  }, [q, status, type, plan, zone, pincode, walletMin, regFrom, regTo, sort, page]);

  const reload = useCallback(() => { setError(null); api(url).then(setData).catch((e) => setError((e as Error).message)); }, [url]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [q, status, type, plan, zone, pincode, walletMin, regFrom, regTo, sort]);

  const rows = data?.customers ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets;
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); allChecked ? rows.forEach((r) => n.delete(r.id)) : rows.forEach((r) => n.add(r.id)); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function exportSelected() {
    const chosen = rows.filter((r) => selected.has(r.id));
    const list = chosen.length ? chosen : rows;
    const head = ["Customer ID", "Name", "Email", "Mobile", "Type", "Plan", "Wallet INR", "Orders", "Last order", "Registered", "Pincode", "Zone", "Executive", "Status"];
    const lines = [head, ...list.map((c) => [c.shortId, c.name ?? "", c.email ?? "", c.phone ?? "", c.type, c.currentPlan ?? "", String(Math.round(c.walletPaise / 100)), String(c.orders), c.lastOrderAt ? c.lastOrderAt.slice(0, 10) : "", c.createdAt.slice(0, 10), c.pincode ?? "", c.zone ?? "", c.assignedExecutive ?? "", c.status])];
    const csv = lines.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `customers-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
    if (chosen.length) api("/api/admin/customers/bulk", { method: "POST", body: JSON.stringify({ ids: chosen.map((c) => c.id), action: "export" }) }).catch(() => {});
  }

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    const ids = [...selected]; if (!ids.length) return;
    try { const r = await api("/api/admin/customers/bulk", { method: "POST", body: JSON.stringify({ ids, action, ...extra }) }); flash(`${r.result.count} customer(s) — ${action}`); setSelected(new Set()); reload(); }
    catch (e) { flash((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, mobile, email, referral code…" className={`${sel} min-w-[240px] flex-1`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DISABLED">Inactive</option><option value="LOCKED">Suspended</option></select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={sel}><option value="">All types</option><option value="SUBSCRIPTION">Subscription</option><option value="TRIAL">Trial</option><option value="REGULAR">Regular</option><option value="NEW">New</option><option value="INACTIVE">Inactive</option></select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={sel}><option value="">All plans</option>{facets?.plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className={sel}><option value="">All zones</option>{facets?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
        <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" className={`${sel} w-28`} />
        <input value={walletMin} onChange={(e) => setWalletMin(e.target.value)} placeholder="Wallet >= INR" className={`${sel} w-32`} />
        <label className="text-xs text-ink-3">Reg from <input type="date" value={regFrom} onChange={(e) => setRegFrom(e.target.value)} className={sel} /></label>
        <label className="text-xs text-ink-3">to <input type="date" value={regTo} onChange={(e) => setRegTo(e.target.value)} className={sel} /></label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel}><option value="created">Newest</option><option value="name">Name A–Z</option><option value="orders">Most orders</option><option value="wallet">Highest wallet</option></select>
        <button onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">{showCreate ? "Close" : "+ New customer"}</button>
      </div>

      {showCreate && <CreateForm flash={flash} onDone={() => { setShowCreate(false); reload(); }} />}
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-leaf/30 bg-leaf/5 px-4 py-2 text-sm">
          <b className="text-forest">{selected.size} selected</b>
          <button onClick={() => bulk("activate")} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Activate</button>
          <button onClick={() => bulk("deactivate")} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Deactivate</button>
          <AssignBulk onAssign={(exec) => bulk("assign-exec", { executive: exec })} />
          <NotifyBulk onSend={(title, body, channel) => bulk("notify", { title, body, channel })} />
          <button onClick={exportSelected} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Export CSV</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-ink-3 underline">clear</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-3 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              {["Customer", "Contact", "Type", "Plan", "Wallet", "Orders", "Last order", "Pincode / zone", "Executive", "Status", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-ink-3">No customers match these filters.</td></tr>}
            {rows.map((c) => (
              <Row key={c.id} c={c} checked={selected.has(c.id)} onCheck={() => toggle(c.id)} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} flash={flash} onChanged={reload} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{total} customer{total === 1 ? "" : "s"}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">← Prev</button>
          <span className="px-2 py-1.5">Page {page} / {Math.max(1, Math.ceil(total / 15))}</span>
          <button disabled={page * 15 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}

function Row({ c, checked, onCheck, open, onToggle, flash, onChanged }: { c: CustomerListItem; checked: boolean; onCheck: () => void; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  return (
    <>
      <tr className="border-b border-mint-soft/60 align-top">
        <td className="px-3 py-3"><input type="checkbox" checked={checked} onChange={onCheck} /></td>
        <td className="px-3 py-3"><div className="font-semibold text-forest">{c.name ?? "—"}</div><div className="font-mono text-xs text-ink-3">{c.shortId}{c.referralCode ? ` · ${c.referralCode.slice(-6).toUpperCase()}` : ""}</div></td>
        <td className="px-3 py-3"><div className="text-ink-2">{c.phone ?? "—"}</div><div className="text-xs text-ink-3">{c.email ?? ""}{!c.emailVerified && c.email ? " · unverified" : ""}</div></td>
        <td className="px-3 py-3"><Pill s={c.type} map={TYPE_TONE} /></td>
        <td className="px-3 py-3 text-xs text-ink-2">{c.currentPlan ?? "—"}</td>
        <td className="px-3 py-3 font-semibold text-forest">{inr(c.walletPaise)}</td>
        <td className="px-3 py-3 text-ink-2">{c.orders}</td>
        <td className="px-3 py-3 text-xs text-ink-3">{fmtDate(c.lastOrderAt)}</td>
        <td className="px-3 py-3 text-xs text-ink-2">{c.pincode ?? "—"}<div className="text-ink-3">{c.zone ?? ""}</div></td>
        <td className="px-3 py-3 text-xs text-ink-2">{c.assignedExecutive ?? "—"}</td>
        <td className="px-3 py-3"><Pill s={c.status} map={ST_TONE} /></td>
        <td className="px-3 py-3"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:bg-[#F6FAF6]">{open ? "Close" : "View"}</button></td>
      </tr>
      {open && <tr><td colSpan={12} className="bg-[#FAFCF9] px-3 py-4"><ProfilePanel id={c.id} flash={flash} onChanged={onChanged} /></td></tr>}
    </>
  );
}

/* ============================= Profile ============================= */
function ProfilePanel({ id, flash, onChanged }: { id: string; flash: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<CustomerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => { api(`/api/admin/customers/${id}`).then((r) => setD(r.customer)).catch((e) => flash((e as Error).message)); }, [id, flash]);
  useEffect(() => { load(); }, [load]);

  async function mutate(payload: Record<string, unknown>, okMsg: string, after?: (r: unknown) => void) {
    setBusy(true);
    try { const r = await api(`/api/admin/customers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); flash(okMsg); load(); onChanged(); after?.(r.result); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  async function subAction(subId: string, payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try { await api(`/api/admin/subscriptions/${subId}`, { method: "PATCH", body: JSON.stringify(payload) }); flash(okMsg); load(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  if (!d) return <p className="text-sm text-ink-3">Loading customer…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* left: identity + addresses + preferences */}
      <div className="space-y-3">
        <Card title="Profile" right={<Pill s={d.status} map={ST_TONE} />}>
          {editing ? <EditForm d={d} busy={busy} onSubmit={(p) => { mutate({ action: "update", ...p }, "Profile updated"); setEditing(false); }} onCancel={() => setEditing(false)} /> : (
            <>
              <p className="font-semibold text-forest">{d.name ?? "—"} <Pill s={d.type} map={TYPE_TONE} /></p>
              <p className="text-xs text-ink-3">{d.shortId} · joined {fmtDate(d.createdAt)}</p>
              <p className="mt-1 text-xs">{d.phone ?? "—"} · {d.email ?? "—"}{!d.emailVerified && d.email ? " (unverified)" : ""}</p>
              <p className="text-xs">Referral <b className="font-mono">{d.referralCode.slice(-8).toUpperCase()}</b> · {d.loyaltyPoints.toLocaleString("en-IN")} pts</p>
              {d.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{d.tags.map((t) => <span key={t} className="rounded-full bg-mint-soft/40 px-2 py-0.5 text-[11px] text-forest">{t}</span>)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => setEditing(true)} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white">Edit</button>
                {d.status === "ACTIVE" ? <>
                  <ConfirmBtn label="Deactivate" onClick={() => mutate({ action: "status", op: "deactivate" }, "Deactivated")} />
                  <ConfirmBtn label="Suspend" onClick={() => mutate({ action: "status", op: "suspend" }, "Suspended")} />
                </> : <button onClick={() => mutate({ action: "status", op: "activate" }, "Activated")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest">Activate</button>}
                <ConfirmBtn label="Delete" danger onClick={() => mutate({ action: "status", op: "delete" }, "Soft-deleted")} />
                <button disabled={busy} onClick={() => mutate({ action: "reset-password" }, "Reset link issued", (r) => { const link = (r as { resetLink?: string })?.resetLink; if (link) flash(`Reset link: ${location.origin}${link}`); })} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Reset password</button>
              </div>
            </>
          )}
        </Card>

        <Card title="Addresses" right={<AddAddressBtn busy={busy} onAdd={(a) => mutate({ action: "add-address", ...a }, "Address added")} />}>
          {d.addresses.length === 0 ? <p className="text-xs text-ink-3">No saved addresses.</p> : d.addresses.map((a) => (
            <div key={a.id} className="mb-2 rounded-lg border border-mint-soft p-2 text-xs">
              <div className="flex items-center justify-between"><b className="text-forest">{a.label}{a.isDefault ? " · default" : ""}</b>
                <span className="flex gap-1">
                  {!a.isDefault && <button onClick={() => mutate({ action: "default-address", addressId: a.id }, "Default set")} className="text-leaf-600 underline">set default</button>}
                  <button onClick={() => mutate({ action: "delete-address", addressId: a.id }, "Address deleted")} className="text-red-600">✕</button>
                </span>
              </div>
              <div className="text-ink-3">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.pincode}{a.zone ? ` · ${a.zone}` : ""}</div>
              {a.lat != null && a.lng != null && <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noopener noreferrer" className="text-leaf-600 underline">View on map ↗</a>}
            </div>
          ))}
        </Card>

        <Card title="Preferences & executive">
          <div className="grid grid-cols-2 gap-1 text-xs">
            {([["emailOptIn", "Email"], ["smsOptIn", "SMS"], ["whatsappOptIn", "WhatsApp"], ["pushOptIn", "Push"], ["marketingOptIn", "Marketing"]] as const).map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={(d.preferences as unknown as Record<string, boolean>)[k]} onChange={(e) => mutate({ action: "preferences", [k]: e.target.checked }, "Preferences updated")} /> {lbl}</label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Assigned executive: <b className="text-forest">{d.preferences.assignedExecutive ?? "—"}</b></p>
          <AssignBulk inline onAssign={(exec) => mutate({ action: "assign-exec", executive: exec }, "Executive assigned")} />
        </Card>
      </div>

      {/* middle: subscriptions + orders + wallet + bottles + deliveries */}
      <div className="space-y-3">
        <Card title="Subscriptions">
          {d.subscriptions.length === 0 ? <p className="text-xs text-ink-3">No subscriptions.</p> : d.subscriptions.map((s) => (
            <div key={s.id} className="mb-2 rounded-lg border border-mint-soft p-2 text-xs">
              <div className="flex items-center justify-between"><b className="text-forest">{s.plan}</b><Pill s={s.status} map={{ ACTIVE: "bg-leaf text-white", PAUSED: "bg-amber-50 text-amber-700", VACATION: "bg-amber-50 text-amber-700", CANCELLED: "bg-gray-100 text-gray-500", COMPLETED: "bg-blue-50 text-blue-700" }} /></div>
              <div className="text-ink-3">{s.shortId} · next {fmtDate(s.nextDeliveryAt)} · {s.deliverySlot} · autopay {s.autoRenew ? "on" : "off"}</div>
              {(s.status === "ACTIVE" || s.status === "PAUSED" || s.status === "VACATION") && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.status === "ACTIVE" ? <Mini label="Pause" onClick={() => subAction(s.id, { action: "pause" }, "Paused")} /> : <Mini label="Resume" onClick={() => subAction(s.id, { action: "resume" }, "Resumed")} />}
                  <Mini label="Skip" onClick={() => subAction(s.id, { action: "skip" }, "Skipped")} />
                  <Mini label="Cancel" danger onClick={() => subAction(s.id, { action: "cancel", reason: "via customer profile" }, "Cancelled")} />
                </div>
              )}
            </div>
          ))}
        </Card>
        <Card title={`Wallet · ${inr(d.wallet.balancePaise)}`} right={<WalletBtn busy={busy} onAdjust={(direction, amountPaise, reason) => mutate({ action: "wallet", direction, amountPaise, reason }, "Wallet updated")} />}>
          {d.wallet.txns.length === 0 ? <p className="text-xs text-ink-3">No transactions.</p> : (
            <table className="w-full text-xs"><tbody>{d.wallet.txns.slice(0, 6).map((w) => <tr key={w.id}><td className="py-0.5 text-ink-2">{w.description ?? w.kind}</td><td className={`py-0.5 text-right font-semibold ${w.type === "CREDIT" ? "text-leaf-600" : "text-red-600"}`}>{w.type === "CREDIT" ? "+" : "−"}{inr(w.amountPaise)}</td></tr>)}</tbody></table>
          )}
          <p className="mt-1 text-xs text-ink-3">Trial cashback: {d.trialCashback ? <b className="text-leaf-600">{d.trialCashback.status} · {inr(d.trialCashback.amountPaise)}</b> : "not credited"}</p>
        </Card>
        <Card title="Orders & deliveries">
          <p className="text-xs text-ink-3">{d.ordersTotal} orders total · bottles pending {d.bottles.pending} (issued {d.bottles.issued} / returned {d.bottles.returned})</p>
          {d.orders.slice(0, 5).map((o) => <div key={o.id} className="flex justify-between text-xs"><span className="text-ink-2">{o.type.replace(/_/g, " ").toLowerCase()} · {fmtDate(o.createdAt)}</span><span className="text-ink-3">{inr(o.totalPaise)} · {o.status.toLowerCase()}</span></div>)}
          {d.deliveries.slice(0, 3).map((dl) => <div key={dl.id} className="flex justify-between text-xs text-ink-3"><span>Delivery {fmtDate(dl.date)}</span><span>{dl.status.replace(/_/g, " ").toLowerCase()}</span></div>)}
        </Card>
        <Card title="Payments · invoices · billing">
          {d.billings.slice(0, 4).map((b) => <div key={b.code} className="flex justify-between text-xs"><span className="font-mono text-ink-2">{b.code} c{b.cycleNumber}</span><span className="text-ink-3">{inr(b.totalPaise)} · {b.paymentStatus.toLowerCase()}</span></div>)}
          {d.invoices.slice(0, 3).map((i) => <div key={i.number} className="flex justify-between text-xs text-ink-3"><span className="font-mono">{i.number}</span><span>{fmtDate(i.issuedAt)}</span></div>)}
          {d.billings.length === 0 && d.invoices.length === 0 && <p className="text-xs text-ink-3">No billing/invoices yet.</p>}
        </Card>
      </div>

      {/* right: referrals + notifications + timeline + notes */}
      <div className="space-y-3">
        <Card title="Referrals & rewards">
          <p className="text-xs">Referred by: <b className="text-forest">{d.referrals.referredBy?.name ?? "—"}</b></p>
          <p className="text-xs text-ink-3">{d.referrals.invited.length} invited · {d.referrals.invited.filter((i) => i.converted).length} converted · {d.loyaltyPoints.toLocaleString("en-IN")} points</p>
          {d.referrals.invited.slice(0, 5).map((r) => <div key={r.id} className="flex justify-between text-xs"><span className="text-ink-2">{r.name ?? "—"}</span><span className={r.converted ? "text-leaf-600" : "text-ink-3"}>{r.converted ? "converted" : "pending"}</span></div>)}
        </Card>
        <Card title="Notifications">
          {d.notifications.length === 0 ? <p className="text-xs text-ink-3">None.</p> : d.notifications.slice(0, 4).map((n) => <div key={n.id} className="border-l-2 border-mint-soft pl-2 text-xs"><b className="text-forest">{n.title}</b><div className="text-ink-3">{fmtDT(n.createdAt)}{n.readAt ? " · read" : ""}</div></div>)}
          {d.supportTickets.length === 0 && <p className="mt-2 text-[11px] italic text-ink-3">No support tickets (ticketing not connected).</p>}
        </Card>
        <Card title="Activity timeline">
          <ol className="space-y-2">
            {d.events.length === 0 && <li className="text-xs text-ink-3">No activity yet.</li>}
            {d.events.map((e) => <li key={e.id} className="border-l-2 border-mint-soft pl-3 text-xs"><div className="font-semibold text-forest">{e.summary}</div><div className="text-ink-3">{fmtDT(e.createdAt)}{e.byRole ? ` · ${e.byRole}` : ""}</div></li>)}
          </ol>
        </Card>
        <Card title="Internal notes">
          {d.notes.map((n) => <div key={n.id} className="mb-1 text-xs"><span className="text-ink-2">{n.body}</span><span className="text-ink-3"> — {fmtDT(n.createdAt)}</span></div>)}
          <NoteBox busy={busy} onAdd={(text) => mutate({ action: "note", body: text }, "Note added")} />
        </Card>
      </div>
    </div>
  );
}

const Mini = ({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) => <button onClick={onClick} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${danger ? "border border-red-200 text-red-600" : "border border-mint-soft text-forest"}`}>{label}</button>;
function ConfirmBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={() => { if (confirm(`${label} this customer?`)) onClick(); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${danger ? "border border-red-200 text-red-600" : "border border-mint-soft text-forest"}`}>{label}</button>;
}

function EditForm({ d, busy, onSubmit, onCancel }: { d: CustomerProfile; busy: boolean; onSubmit: (p: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState(d.name ?? "");
  const [email, setEmail] = useState(d.email ?? "");
  const [phone, setPhone] = useState(d.phone ?? "");
  const [tags, setTags] = useState(d.tags.join(", "));
  return (
    <div className="space-y-2 text-xs">
      <label className="block">Name<input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></label>
      <label className="block">Email<input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} /></label>
      <label className="block">Mobile<input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} /></label>
      <label className="block">Tags (comma-separated)<input value={tags} onChange={(e) => setTags(e.target.value)} className={inp} /></label>
      <div className="flex gap-2"><button disabled={busy} onClick={() => onSubmit({ name, email, phone, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) })} className="rounded-full bg-leaf px-4 py-1.5 font-semibold text-white disabled:opacity-50">Save</button><button onClick={onCancel} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest">Cancel</button></div>
    </div>
  );
}
function WalletBtn({ busy, onAdjust }: { busy: boolean; onAdjust: (d: "credit" | "debit", amt: number, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<"credit" | "debit">("credit");
  const [amt, setAmt] = useState(""); const [reason, setReason] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft px-2.5 py-1 text-[11px] font-semibold text-forest">Adjust</button>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select value={dir} onChange={(e) => setDir(e.target.value as "credit" | "debit")} className="rounded border border-mint-soft px-1 py-0.5 text-[11px]"><option value="credit">Credit</option><option value="debit">Debit</option></select>
      <input type="number" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="INR" className="w-16 rounded border border-mint-soft px-1 py-0.5 text-[11px]" />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" className="w-24 rounded border border-mint-soft px-1 py-0.5 text-[11px]" />
      <button disabled={busy} onClick={() => { onAdjust(dir, Math.max(1, Math.round(Number(amt || 0) * 100)), reason); setOpen(false); setAmt(""); }} className="rounded-full bg-forest px-2 py-0.5 text-[11px] font-semibold text-white">Go</button>
    </div>
  );
}
function AddAddressBtn({ busy, onAdd }: { busy: boolean; onAdd: (a: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: "Home", line1: "", city: "", pincode: "" });
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft px-2.5 py-1 text-[11px] font-semibold text-forest">+ Add</button>;
  return (
    <div className="absolute right-4 top-10 z-10 w-56 space-y-1 rounded-lg border border-mint-soft bg-white p-2 shadow-lg">
      {(["label", "line1", "city", "pincode"] as const).map((k) => <input key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={k} className="w-full rounded border border-mint-soft px-2 py-1 text-xs" />)}
      <div className="flex gap-1"><button disabled={busy || !f.line1 || !f.city || !f.pincode} onClick={() => { onAdd(f); setOpen(false); }} className="rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Add</button><button onClick={() => setOpen(false)} className="text-xs text-ink-3">cancel</button></div>
    </div>
  );
}
function NoteBox({ busy, onAdd }: { busy: boolean; onAdd: (t: string) => void }) {
  const [text, setText] = useState("");
  return <div className="flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="flex-1 rounded border border-mint-soft px-2 py-1 text-xs" /><button disabled={busy || !text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest disabled:opacity-40">Add</button></div>;
}
function AssignBulk({ onAssign, inline }: { onAssign: (exec: string) => void; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [execs, setExecs] = useState<string[]>([]);
  const [val, setVal] = useState("");
  useEffect(() => { if (open && execs.length === 0) api("/api/admin/customers/options").then((r) => setExecs(r.executives)).catch(() => {}); }, [open, execs.length]);
  if (!open) return <button onClick={() => setOpen(true)} className={inline ? "mt-1 text-[11px] font-semibold text-leaf-600 underline" : "rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest"}>Assign executive</button>;
  return (
    <span className="flex items-center gap-1">
      <input list="execs" value={val} onChange={(e) => setVal(e.target.value)} placeholder="executive" className="w-32 rounded border border-mint-soft px-2 py-1 text-xs" />
      <datalist id="execs">{execs.map((x) => <option key={x} value={x} />)}</datalist>
      <button onClick={() => { if (val.trim()) { onAssign(val.trim()); setOpen(false); setVal(""); } }} className="rounded-full bg-forest px-2 py-1 text-[11px] font-semibold text-white">OK</button>
    </span>
  );
}
function NotifyBulk({ onSend }: { onSend: (title: string, body: string, channel: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [channel, setChannel] = useState("PUSH");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft bg-white px-3 py-1 text-xs font-semibold text-forest">Send notification</button>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded border border-mint-soft px-1 py-1 text-[11px]">{["PUSH", "EMAIL", "SMS", "WHATSAPP"].map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" className="w-28 rounded border border-mint-soft px-2 py-1 text-xs" />
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="message" className="w-40 rounded border border-mint-soft px-2 py-1 text-xs" />
      <button onClick={() => { if (title.trim() && body.trim()) { onSend(title, body, channel); setOpen(false); setTitle(""); setBody(""); } }} className="rounded-full bg-forest px-2 py-1 text-[11px] font-semibold text-white">Send</button>
    </span>
  );
}

/* ============================= Create ============================= */
function CreateForm({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!email.trim() && !phone.trim()) { flash("Provide an email or mobile."); return; }
    setBusy(true);
    try { await api("/api/admin/customers", { method: "POST", body: JSON.stringify({ name: name || undefined, email: email || undefined, phone: phone || undefined, tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined }) }); flash("Customer created"); onDone(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-2xl border border-mint-soft bg-white p-4">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">New customer</h4>
      <div className="grid gap-2 sm:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inp} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inp} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile" className={inp} />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma)" className={inp} />
      </div>
      <button disabled={busy} onClick={submit} className="mt-2 rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create customer"}</button>
    </div>
  );
}

/* ============================= Reports ============================= */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [r, setR] = useState<CustomerReports | null>(null);

  const range = useMemo(() => {
    if (preset === "custom") return { from, to };
    const now = new Date(); const end = todayISO(); const start = new Date(now);
    if (preset === "today") { /* today */ } else if (preset === "7") start.setDate(start.getDate() - 7);
    else if (preset === "30") start.setDate(start.getDate() - 30); else if (preset === "month") start.setDate(1);
    else if (preset === "year") { start.setMonth(0); start.setDate(1); }
    return { from: start.toISOString().slice(0, 10), to: end };
  }, [preset, from, to]);

  const load = useCallback(() => { const p = new URLSearchParams(); if (range.from) p.set("from", range.from); if (range.to) p.set("to", range.to); api(`/api/admin/customers/reports?${p.toString()}`).then(setR).catch((e) => flash((e as Error).message)); }, [range, flash]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!r) return;
    const head = ["Customer ID", "Name", "Mobile", "Email", "Type", "Status", "Plan", "Wallet INR", "Orders", "Registered", "Pincode", "Zone"];
    const lines = [head, ...r.rows.map((x) => [x.shortId, x.name, x.phone, x.email, x.type, x.status, x.plan, String(x.walletRupees), String(x.orders), x.registered, x.pincode, x.zone])];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `customers-report-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className={sel}><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom</option></select>
        {preset === "custom" && <><label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label><label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label></>}
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest">Refresh</button>
        <button onClick={exportCsv} disabled={!r} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>
      {!r ? <p className="text-sm text-ink-3">Loading…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Customers (range)" value={String(r.active.total)} />
            <Kpi label="Active / inactive" value={`${r.active.active} / ${r.active.inactive}`} />
            <Kpi label="Retention rate" value={`${r.retention.rate}%`} sub={`${r.retention.withRepeatOrders} repeat`} />
            <Kpi label="Trial conversion" value={`${r.trial.rate}%`} sub={`${r.trial.converted}/${r.trial.trials}`} />
            <Kpi label="Subscriptions" value={String(r.subscription.active)} sub={`${r.subscription.paused} paused · ${r.subscription.cancelled} cancelled`} />
            <Kpi label="Referrers" value={String(r.referral.referrers)} sub={`${r.referral.converted}/${r.referral.invited} invited converted`} />
            <Kpi label="Wallet outstanding" value={inr(r.wallet.outstandingPaise)} />
            <Kpi label="Cashback / referral paid" value={`${inr(r.wallet.cashbackPaise)} / ${inr(r.wallet.referralPaise)}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="Customer growth (by month)" head={["Month", "New customers"]} rows={r.growth.map((x) => [x.month, String(x.count)])} />
            <ReportTable title="Top customers by revenue" head={["Customer", "Orders", "Revenue"]} rows={r.revenueByCustomer.map((x) => [x.name ?? x.phone ?? "—", String(x.orders), inr(x.revenuePaise)])} />
          </div>
        </>
      )}
    </div>
  );
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="rounded-2xl border border-mint-soft bg-white">
      <h4 className="border-b border-mint-soft px-4 py-2.5 text-sm font-bold text-forest">{title}</h4>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-3"><tr>{head.map((h, i) => <th key={h} className={`px-4 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-4 py-6 text-center text-ink-3">No data.</td></tr>}
          {rows.map((row, i) => <tr key={i} className="border-t border-mint-soft/60">{row.map((c, j) => <td key={j} className={`px-4 py-2 ${j > 0 ? "text-right text-ink-2" : "font-medium text-forest"}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
