"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubListItem, SubListResponse, SubStats, SubDetail, SubReports } from "@/lib/subscriptions/types";

/* ---------- shared helpers (match the admin module conventions) ---------- */
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDT = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const inp = "w-full rounded-lg border border-mint-soft px-3 py-2 text-sm outline-none focus:border-leaf";
const SLOTS = ["06:00-08:00", "07:00-09:00", "08:00-10:00", "17:00-19:00", "18:00-20:00"];

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

const ST_TONE: Record<string, string> = {
  ACTIVE: "bg-leaf text-white", PAUSED: "bg-amber-50 text-amber-700", VACATION: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-500", COMPLETED: "bg-blue-50 text-blue-700", EXPIRED: "bg-red-50 text-red-700",
};
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ST_TONE[s] ?? "bg-gray-100 text-gray-600"}`}>{s[0] + s.slice(1).toLowerCase()}</span>;
const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl border border-mint-soft bg-white p-5">
    <div className="font-display text-2xl font-bold text-leaf-600">{value}</div>
    <div className="mt-1 text-sm text-ink-3">{label}</div>
    {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
  </div>
);

type Tab = "dashboard" | "subscriptions" | "create" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" }, { key: "subscriptions", label: "Subscriptions" },
  { key: "create", label: "Create" }, { key: "reports", label: "Reports" },
];

export function SubscriptionsBoard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); }, []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-mint-soft">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-x border-t border-mint-soft bg-white text-forest" : "text-ink-3 hover:text-forest"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "dashboard" && <DashboardTab flash={flash} />}
      {tab === "subscriptions" && <SubscriptionsTab flash={flash} />}
      {tab === "create" && <CreateTab flash={flash} onDone={() => setTab("subscriptions")} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ============================= Dashboard ============================= */
function DashboardTab({ flash }: { flash: (m: string) => void }) {
  const [s, setS] = useState<SubStats | null>(null);
  useEffect(() => { api("/api/admin/subscriptions/stats").then(setS).catch((e) => flash((e as Error).message)); }, [flash]);
  if (!s) return <p className="text-sm text-ink-3">Loading…</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Total subscriptions" value={String(s.total)} sub={`${s.newThisMonth} new this month`} />
      <Kpi label="Active" value={String(s.active)} />
      <Kpi label="Paused / Vacation" value={String(s.paused)} />
      <Kpi label="Cancelled" value={String(s.cancelled)} />
      <Kpi label="Expired / lapsed" value={String(s.expired)} />
      <Kpi label="AutoPay on" value={String(s.autopayOn)} sub={s.total ? `${Math.round((s.autopayOn / s.total) * 100)}% of all` : undefined} />
      <Kpi label="Renewals due (7 days)" value={String(s.renewalsDue7d)} />
      <Kpi label="Monthly recurring value" value={inr(s.mrrPaise)} sub="active × 30 deliveries" />
      <Kpi label="Trial cashback credited" value={String(s.trialCashback.credited)} sub={inr(s.trialCashback.amountPaise)} />
    </div>
  );
}

/* ============================= List ============================= */
function SubscriptionsTab({ flash }: { flash: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [autopay, setAutopay] = useState("");
  const [plan, setPlan] = useState("");
  const [product, setProduct] = useState("");
  const [zone, setZone] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SubListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (autopay) p.set("autopay", autopay);
    if (plan) p.set("plan", plan);
    if (product) p.set("product", product);
    if (zone) p.set("zone", zone);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("sort", sort); p.set("dir", dir);
    p.set("page", String(page)); p.set("pageSize", "15");
    return `/api/admin/subscriptions?${p.toString()}`;
  }, [q, status, autopay, plan, product, zone, from, to, sort, dir, page]);

  const reload = useCallback(() => { setError(null); api(url).then(setData).catch((e) => setError((e as Error).message)); }, [url]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [q, status, autopay, plan, product, zone, from, to, sort, dir]);

  const rows = data?.subscriptions ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets;
  const sel = "rounded-lg border border-mint-soft bg-white px-3 py-2 text-sm outline-none focus:border-leaf";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, mobile, email…" className={`${sel} min-w-[230px] flex-1`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused / Vacation</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired</option><option value="COMPLETED">Completed</option>
        </select>
        <select value={autopay} onChange={(e) => setAutopay(e.target.value)} className={sel}>
          <option value="">AutoPay: any</option><option value="on">AutoPay on</option><option value="off">AutoPay off</option>
        </select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={sel}>
          <option value="">All plans</option>{facets?.plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className={sel}>
          <option value="">All products</option>{facets?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className={sel}>
          <option value="">All zones</option>{facets?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
        <label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
        <select value={`${sort}:${dir}`} onChange={(e) => { const [s, d] = e.target.value.split(":"); setSort(s); setDir(d as "asc" | "desc"); }} className={sel}>
          <option value="created:desc">Newest first</option><option value="created:asc">Oldest first</option>
          <option value="next:asc">Next delivery ↑</option><option value="updated:desc">Recently updated</option>
          <option value="start:desc">Start date ↓</option><option value="status:asc">Status A–Z</option>
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>{["Subscription", "Customer", "Items", "Plan", "Next", "Slot", "AutoPay", "Wallet", "Status", "Updated", ""].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-ink-3">No subscriptions match these filters.</td></tr>}
            {rows.map((s) => (
              <Row key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} flash={flash} onChanged={reload} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{total} subscription{total === 1 ? "" : "s"}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">← Prev</button>
          <span className="px-2 py-1.5">Page {page} / {Math.max(1, Math.ceil(total / 15))}</span>
          <button disabled={page * 15 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-mint-soft px-4 py-1.5 font-semibold text-forest disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}

function Row({ s, open, onToggle, flash, onChanged }: { s: SubListItem; open: boolean; onToggle: () => void; flash: (m: string) => void; onChanged: () => void }) {
  return (
    <>
      <tr className="border-b border-mint-soft/60 align-top">
        <td className="px-3 py-3"><div className="font-mono text-xs font-bold text-forest">{s.shortId}</div><div className="text-xs text-ink-3">{fmtDate(s.startDate)}</div></td>
        <td className="px-3 py-3"><div className="font-semibold text-forest">{s.customer.name ?? "—"}</div><div className="text-xs text-ink-3">{s.customer.phone ?? s.customer.email ?? ""}</div></td>
        <td className="px-3 py-3 text-xs text-ink-2">{s.items.map((i) => `${i.qty}× ${i.product} ${i.variant}`).join(", ")}</td>
        <td className="px-3 py-3"><div className="text-ink-2">{s.plan.name}</div><div className="text-xs text-ink-3">{inr(s.perDeliveryPaise)}/delivery</div></td>
        <td className="px-3 py-3 text-ink-2">{fmtDate(s.nextDeliveryAt)}</td>
        <td className="px-3 py-3 text-xs text-ink-2">{s.deliverySlot}</td>
        <td className="px-3 py-3">{s.autoRenew ? <span className="rounded-full bg-leaf/10 px-2 py-0.5 text-xs font-bold text-leaf-600">On</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-500">Off</span>}</td>
        <td className="px-3 py-3 text-ink-2">{inr(s.walletPaise)}</td>
        <td className="px-3 py-3"><Pill s={s.expired && s.status !== "CANCELLED" ? "EXPIRED" : s.status} /></td>
        <td className="px-3 py-3 text-xs text-ink-3">{fmtDate(s.updatedAt)}</td>
        <td className="px-3 py-3"><button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:bg-[#F6FAF6]">{open ? "Close" : "Manage"}</button></td>
      </tr>
      {open && <tr><td colSpan={11} className="bg-[#FAFCF9] px-3 py-4"><ManagePanel id={s.id} flash={flash} onChanged={onChanged} /></td></tr>}
    </>
  );
}

/* ============================= Manage panel ============================= */
function ManagePanel({ id, flash, onChanged }: { id: string; flash: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<SubDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => { api(`/api/admin/subscriptions/${id}`).then((r) => setD(r.subscription)).catch((e) => flash((e as Error).message)); }, [id, flash]);
  useEffect(() => { load(); }, [load]);

  async function mutate(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try { await api(`/api/admin/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); flash(okMsg); load(); onChanged(); }
    catch (e) { flash((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!d) return <p className="text-sm text-ink-3">Loading subscription…</p>;
  const closed = d.status === "CANCELLED" || d.status === "COMPLETED";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* left: customer + address + items */}
      <div className="space-y-3">
        <Card title="Customer">
          <p className="font-semibold text-forest">{d.customer.name ?? "—"}</p>
          <p className="text-xs text-ink-3">{d.customer.email ?? ""}</p>
          <p className="text-xs text-ink-3">{d.customer.phone ?? ""}</p>
          <p className="mt-1 text-xs">Wallet balance: <b className="text-forest">{inr(d.customer.walletPaise)}</b></p>
        </Card>
        {d.address && (
          <Card title="Delivery address">
            <p className="text-sm text-ink-2">{d.address.label}</p>
            <p className="text-xs text-ink-3">{d.address.line1}{d.address.line2 ? `, ${d.address.line2}` : ""}, {d.address.city} {d.address.pincode}</p>
            {d.address.zone && <p className="text-xs text-ink-3">Zone: {d.address.zone}{d.address.executive ? ` · ${d.address.executive}` : ""}</p>}
            {d.address.deliveryNote && <p className="mt-1 text-xs italic text-ink-3">“{d.address.deliveryNote}”</p>}
            {d.address.lat != null && d.address.lng != null && <a href={`https://www.google.com/maps?q=${d.address.lat},${d.address.lng}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-leaf-600 underline">View on map ↗</a>}
          </Card>
        )}
        <Card title="Items & pricing">
          <table className="w-full text-xs">
            <tbody>
              {d.items.map((i) => <tr key={i.variantId}><td className="py-0.5 text-ink-2">{i.qty}× {i.product} {i.variant}</td><td className="py-0.5 text-right text-ink-3">{inr(i.qty * i.dailyPaise)}</td></tr>)}
            </tbody>
          </table>
          <div className="mt-2 space-y-0.5 border-t border-mint-soft pt-2 text-xs">
            <div className="flex justify-between"><span className="text-ink-3">Per delivery</span><b className="text-forest">{inr(d.perDeliveryPaise)}</b></div>
            <div className="flex justify-between"><span className="text-ink-3">Plan ({d.plan.name}, {d.plan.days}d)</span><b className="text-forest">{inr(d.planTotalPaise)}</b></div>
            {d.savedPaise > 0 && <div className="flex justify-between text-leaf-600"><span>Saved</span><b>{inr(d.savedPaise)}</b></div>}
          </div>
        </Card>
      </div>

      {/* middle: schedule + autopay + cashback + wallet + deliveries */}
      <div className="space-y-3">
        <Card title="Schedule">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-ink-3">Status</span><span><Pill s={d.status} /></span>
            <span className="text-ink-3">Next delivery</span><b className="text-forest">{fmtDate(d.nextDeliveryAt)}</b>
            <span className="text-ink-3">Slot</span><span className="text-ink-2">{d.deliverySlot}</span>
            <span className="text-ink-3">Start → End</span><span className="text-ink-2">{fmtDate(d.startDate)} → {fmtDate(d.endDate)}</span>
            {d.pausedUntil && <><span className="text-ink-3">Paused until</span><span className="text-amber-700">{fmtDate(d.pausedUntil)}</span></>}
            {d.skipDates.length > 0 && <><span className="text-ink-3">Skips</span><span className="text-ink-2">{d.skipDates.map((x) => fmtDate(x)).join(", ")}</span></>}
          </div>
          <p className="mt-2 mb-1 text-[11px] uppercase tracking-wide text-ink-3">Next 14 days (8 PM cut-off)</p>
          <div className="flex flex-wrap gap-1">
            {d.schedule.map((day) => {
              const tone = day.deliver ? "bg-leaf text-white" : day.reason === "skipped" ? "bg-amber-100 text-amber-700" : day.reason === "paused" ? "bg-gray-200 text-gray-500" : "bg-gray-50 text-gray-400";
              return <span key={day.date} title={`${fmtDate(day.date)} — ${day.reason}`} className={`h-7 w-7 rounded-md text-center text-[11px] leading-7 ${tone}`}>{new Date(day.date).getDate()}</span>;
            })}
          </div>
        </Card>
        <Card title="AutoPay & cashback">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-3">AutoPay</span>
            <span className="flex items-center gap-2">
              <b className={d.autoRenew ? "text-leaf-600" : "text-ink-3"}>{d.autoRenew ? "On" : "Off"}</b>
              {!closed && <button disabled={busy} onClick={() => mutate({ action: "autopay", on: !d.autoRenew }, d.autoRenew ? "AutoPay disabled" : "AutoPay enabled")} className="rounded-full border border-mint-soft px-2 py-0.5 text-[11px] font-semibold text-forest disabled:opacity-50">{d.autoRenew ? "Turn off" : "Turn on"}</button>}
            </span>
          </div>
          {d.autopay && <p className="mt-1 text-xs text-ink-3">Mandate {d.autopay.status.toLowerCase()} · {inr(d.autopay.amountPaise)} · next {fmtDate(d.autopay.nextRenewalAt)}</p>}
          <p className="mt-1 text-xs">Trial cashback: {d.trialCashback ? <b className="text-leaf-600">{d.trialCashback.status} · {inr(d.trialCashback.amountPaise)}</b> : <span className="text-ink-3">not credited</span>}</p>
        </Card>
        <Card title={`Wallet activity`}>
          {d.wallet.recent.length === 0 ? <p className="text-xs text-ink-3">No recent transactions.</p> : (
            <table className="w-full text-xs"><tbody>
              {d.wallet.recent.map((w) => <tr key={w.id}><td className="py-0.5 text-ink-2">{w.description ?? w.kind}</td><td className={`py-0.5 text-right font-semibold ${w.type === "CREDIT" ? "text-leaf-600" : "text-red-600"}`}>{w.type === "CREDIT" ? "+" : "−"}{inr(w.amountPaise)}</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Card title="Deliveries">
          <p className="text-xs text-ink-3">{d.deliveryCounts.delivered} delivered · {d.deliveryCounts.skipped} skipped · {d.deliveryCounts.failed} failed · {d.deliveryCounts.total} total</p>
          {d.deliveries.slice(0, 5).map((dl) => <div key={dl.id} className="flex justify-between text-xs"><span className="text-ink-2">{fmtDate(dl.date)}</span><span className="text-ink-3">{dl.status.replace(/_/g, " ").toLowerCase()}</span></div>)}
        </Card>
      </div>

      {/* right: actions + timeline + notes */}
      <div className="space-y-3">
        {!closed && (
          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setEditing((v) => !v)} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white">{editing ? "Cancel edit" : "Edit"}</button>
              {d.status === "ACTIVE" ? <PauseBtn busy={busy} onPause={(until, reason) => mutate({ action: "pause", until, reason }, "Subscription paused")} />
                : <button disabled={busy} onClick={() => mutate({ action: "resume" }, "Subscription resumed")} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Resume</button>}
              <SkipBtn busy={busy} nextISO={d.nextDeliveryAt} onSkip={(date) => mutate({ action: "skip", date }, "Delivery skipped")} />
              <CancelBtn busy={busy} maxRefund={d.planTotalPaise} onCancel={(reason, refundPaise) => mutate({ action: "cancel", reason, refundPaise }, "Subscription cancelled")} />
            </div>
            {editing && <EditForm d={d} busy={busy} flash={flash} onSubmit={(payload) => { mutate(payload, "Subscription updated"); setEditing(false); }} />}
          </Card>
        )}
        {closed && d.cancelReason && <Card title="Closed"><p className="text-xs text-ink-3">Reason: {d.cancelReason}</p></Card>}
        <Card title="Timeline">
          <ol className="space-y-2">
            {d.events.length === 0 && <li className="text-xs text-ink-3">No events yet.</li>}
            {d.events.map((e) => (
              <li key={e.id} className="border-l-2 border-mint-soft pl-3 text-xs">
                <div className="font-semibold text-forest">{e.summary}</div>
                <div className="text-ink-3">{fmtDT(e.createdAt)}{e.byRole ? ` · ${e.byRole}` : ""}</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Internal notes">
          {d.notes && <pre className="mb-2 whitespace-pre-wrap text-xs text-ink-2">{d.notes}</pre>}
          <NoteBox busy={busy} onAdd={(text) => mutate({ action: "note", text }, "Note added")} />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-mint-soft bg-white p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h4>{children}</div>;
}

function PauseBtn({ busy, onPause }: { busy: boolean; onPause: (until: string | undefined, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700">Pause</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2">
      <label className="text-[11px] text-ink-3">Until <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded border border-mint-soft px-2 py-1 text-xs" /></label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="rounded border border-mint-soft px-2 py-1 text-xs" />
      <button disabled={busy} onClick={() => { onPause(until ? new Date(until).toISOString() : undefined, reason); setOpen(false); }} className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Confirm</button>
    </div>
  );
}

function SkipBtn({ busy, nextISO, onSkip }: { busy: boolean; nextISO: string | null; onSkip: (date: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(nextISO ? nextISO.slice(0, 10) : todayISO());
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest">Skip</button>;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#F6FAF6] p-2">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-mint-soft px-2 py-1 text-xs" />
      <button disabled={busy} onClick={() => { onSkip(new Date(date).toISOString()); setOpen(false); }} className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Skip day</button>
    </div>
  );
}

function CancelBtn({ busy, maxRefund, onCancel }: { busy: boolean; maxRefund: number; onCancel: (reason: string, refundPaise: number) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">Cancel</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="rounded border border-mint-soft px-2 py-1 text-xs" />
      <label className="text-[11px] text-ink-3">Refund ₹ <input type="number" min={0} value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="0" className="w-20 rounded border border-mint-soft px-2 py-1 text-xs" /></label>
      <button disabled={busy} onClick={() => { onCancel(reason, Math.max(0, Math.round(Number(refund || 0) * 100))); setOpen(false); }} className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Confirm cancel</button>
    </div>
  );
}

function NoteBox({ busy, onAdd }: { busy: boolean; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="flex-1 rounded border border-mint-soft px-2 py-1 text-xs" />
      <button disabled={busy || !text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest disabled:opacity-40">Add</button>
    </div>
  );
}

/* ---- Edit form (plan / slot / address / items / autopay / notes) ---- */
interface Catalogue { plans: { id: string; name: string; days: number; discountBps: number }[]; products: { id: string; name: string; variants: { id: string; label: string; ml: number; dailyPaise: number }[] }[] }
type Addr = { id: string; label: string; line1: string; city: string; pincode: string; zone: { name: string } | null };

function EditForm({ d, busy, flash, onSubmit }: { d: SubDetail; busy: boolean; flash: (m: string) => void; onSubmit: (p: Record<string, unknown>) => void }) {
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [planId, setPlanId] = useState("");
  const [slot, setSlot] = useState(d.deliverySlot);
  const [addressId, setAddressId] = useState("");
  const [autoRenew, setAutoRenew] = useState(d.autoRenew);
  const [notes, setNotes] = useState(d.notes ?? "");
  const [items, setItems] = useState(d.items.map((i) => ({ variantId: i.variantId, qty: i.qty })));

  useEffect(() => {
    api("/api/admin/subscriptions/options").then(setCat).catch((e) => flash((e as Error).message));
    api(`/api/admin/subscriptions/options?userId=${d.customer.id}`).then((r) => setAddrs(r.addresses)).catch(() => {});
  }, [d.customer.id, flash]);

  const variantById = useMemo(() => { const m = new Map<string, { label: string; product: string; dailyPaise: number }>(); cat?.products.forEach((p) => p.variants.forEach((v) => m.set(v.id, { label: v.label, product: p.name, dailyPaise: v.dailyPaise }))); return m; }, [cat]);
  const perDelivery = items.reduce((a, i) => a + i.qty * (variantById.get(i.variantId)?.dailyPaise ?? d.items.find((x) => x.variantId === i.variantId)?.dailyPaise ?? 0), 0);

  function submit() {
    const payload: Record<string, unknown> = { action: "update", deliverySlot: slot, autoRenew, notes };
    if (planId) payload.planId = planId;
    if (addressId) payload.addressId = addressId;
    if (items.length) payload.items = items;
    onSubmit(payload);
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-mint-soft bg-[#F6FAF6] p-3 text-xs">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">Plan<select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inp}><option value="">{d.plan.name} (keep)</option>{cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.days}d</option>)}</select></label>
        <label className="block">Slot<select value={slot} onChange={(e) => setSlot(e.target.value)} className={inp}>{[...new Set([d.deliverySlot, ...SLOTS])].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="block">Address<select value={addressId} onChange={(e) => setAddressId(e.target.value)} className={inp}><option value="">Keep current</option>{addrs.map((a) => <option key={a.id} value={a.id}>{a.label} · {a.city} {a.pincode}</option>)}</select></label>
        <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} /> AutoPay / auto-renew</label>
      </div>
      <div>
        <p className="mb-1 font-semibold text-ink-3">Items</p>
        {items.map((it, idx) => (
          <div key={idx} className="mb-1 flex items-center gap-2">
            <select value={it.variantId} onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, variantId: e.target.value } : x))} className={`${inp} flex-1`}>
              {cat?.products.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} · {v.label}</option>)) ?? <option value={it.variantId}>{variantById.get(it.variantId)?.product} {variantById.get(it.variantId)?.label}</option>}
            </select>
            <input type="number" min={1} max={20} value={it.qty} onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))} className="w-16 rounded border border-mint-soft px-2 py-1" />
            <button onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))} className="text-red-600">✕</button>
          </div>
        ))}
        {cat && <button onClick={() => setItems((arr) => [...arr, { variantId: cat.products[0]?.variants[0]?.id ?? "", qty: 1 }])} className="rounded-full border border-mint-soft px-3 py-1 font-semibold text-forest">+ Add item</button>}
      </div>
      <label className="block">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} /></label>
      <div className="flex items-center justify-between">
        <span className="text-ink-3">Per delivery: <b className="text-forest">{inr(perDelivery)}</b></span>
        <button disabled={busy} onClick={submit} className="rounded-full bg-leaf px-4 py-1.5 font-semibold text-white disabled:opacity-50">Save changes</button>
      </div>
    </div>
  );
}

/* ============================= Create ============================= */
function CreateTab({ flash, onDone }: { flash: (m: string) => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string | null; email: string | null; phone: string | null }[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string | null } | null>(null);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [planId, setPlanId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [slot, setSlot] = useState(SLOTS[0]);
  const [startDate, setStartDate] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [items, setItems] = useState<{ variantId: string; qty: number }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/api/admin/subscriptions/options").then((c: Catalogue) => { setCat(c); setPlanId(c.plans[0]?.id ?? ""); if (c.products[0]?.variants[0]) setItems([{ variantId: c.products[0].variants[0].id, qty: 1 }]); }).catch((e) => flash((e as Error).message)); }, [flash]);

  function searchCustomers() { if (!q.trim()) return; api(`/api/admin/subscriptions/options?q=${encodeURIComponent(q.trim())}`).then((r) => setCustomers(r.customers)).catch((e) => flash((e as Error).message)); }
  function pick(c: { id: string; name: string | null }) {
    setCustomer(c); setCustomers([]);
    api(`/api/admin/subscriptions/options?userId=${c.id}`).then((r) => { setAddrs(r.addresses); setAddressId(r.addresses[0]?.id ?? ""); }).catch((e) => flash((e as Error).message));
  }

  const variantById = useMemo(() => { const m = new Map<string, { label: string; product: string; dailyPaise: number }>(); cat?.products.forEach((p) => p.variants.forEach((v) => m.set(v.id, { label: v.label, product: p.name, dailyPaise: v.dailyPaise }))); return m; }, [cat]);
  const plan = cat?.plans.find((p) => p.id === planId);
  const perDelivery = items.reduce((a, i) => a + i.qty * (variantById.get(i.variantId)?.dailyPaise ?? 0), 0);
  const planTotal = plan ? Math.round(perDelivery * plan.days * (1 - plan.discountBps / 10000)) : 0;
  const canSubmit = customer && planId && addressId && items.length > 0 && items.every((i) => i.variantId);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api("/api/admin/subscriptions", { method: "POST", body: JSON.stringify({ userId: customer!.id, planId, addressId, items, deliverySlot: slot, autoRenew, ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}) }) });
      flash("Subscription created"); onDone();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card title="1 · Customer">
        {customer ? (
          <p className="flex items-center justify-between text-sm"><span className="font-semibold text-forest">{customer.name ?? customer.id}</span><button onClick={() => { setCustomer(null); setAddrs([]); }} className="text-xs text-leaf-600 underline">change</button></p>
        ) : (
          <>
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchCustomers()} placeholder="Search name / mobile / email" className={inp} />
              <button onClick={searchCustomers} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white">Search</button>
            </div>
            {customers.map((c) => <button key={c.id} onClick={() => pick(c)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-mint-soft px-3 py-2 text-left text-sm hover:bg-[#F6FAF6]"><span>{c.name ?? "—"}</span><span className="text-xs text-ink-3">{c.phone ?? c.email}</span></button>)}
          </>
        )}
      </Card>

      {customer && (
        <>
          <Card title="2 · Plan & items">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">Plan<select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inp}>{cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.days}d · {(p.discountBps / 100).toFixed(0)}% off</option>)}</select></label>
              <label className="block text-xs">Slot<select value={slot} onChange={(e) => setSlot(e.target.value)} className={inp}>{SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>
            <div className="mt-2">
              {items.map((it, idx) => (
                <div key={idx} className="mb-1 flex items-center gap-2 text-xs">
                  <select value={it.variantId} onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, variantId: e.target.value } : x))} className={`${inp} flex-1`}>
                    {cat?.products.flatMap((p) => p.variants.map((v) => <option key={v.id} value={v.id}>{p.name} · {v.label} · {inr(v.dailyPaise)}</option>))}
                  </select>
                  <input type="number" min={1} max={20} value={it.qty} onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))} className="w-16 rounded border border-mint-soft px-2 py-1" />
                  <button onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))} className="text-red-600">✕</button>
                </div>
              ))}
              {cat && <button onClick={() => setItems((arr) => [...arr, { variantId: cat.products[0]?.variants[0]?.id ?? "", qty: 1 }])} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest">+ Add item</button>}
            </div>
          </Card>
          <Card title="3 · Address & start">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">Address<select value={addressId} onChange={(e) => setAddressId(e.target.value)} className={inp}>{addrs.length === 0 && <option value="">No saved address</option>}{addrs.map((a) => <option key={a.id} value={a.id}>{a.label} · {a.city} {a.pincode}</option>)}</select></label>
              <label className="block text-xs">Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={todayISO()} className={inp} /></label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} /> Enable AutoPay / auto-renew</label>
            <p className="mt-1 text-[11px] text-ink-3">Leave start date blank to use the next available slot (honours the 8 PM cut-off).</p>
          </Card>
          <div className="flex items-center justify-between rounded-2xl border border-mint-soft bg-white p-4">
            <div className="text-sm"><span className="text-ink-3">Per delivery </span><b className="text-forest">{inr(perDelivery)}</b><span className="text-ink-3"> · plan total </span><b className="text-forest">{inr(planTotal)}</b></div>
            <button disabled={!canSubmit || busy} onClick={submit} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create subscription"}</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================= Reports ============================= */
function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [r, setR] = useState<SubReports | null>(null);
  const load = useCallback(() => { const p = new URLSearchParams(); if (from) p.set("from", from); if (to) p.set("to", to); api(`/api/admin/subscriptions/reports?${p.toString()}`).then(setR).catch((e) => flash((e as Error).message)); }, [from, to, flash]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!r) return;
    const head = ["Subscription", "Customer", "Mobile", "Plan", "Status", "Start", "End", "Slot", "AutoPay", "₹/delivery"];
    const lines = [head, ...r.rows.map((x) => [x.shortId, x.customer, x.phone, x.plan, x.status, x.startDate, x.endDate, x.slot, x.autopay, String(x.perDeliveryRupees)])];
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = u; a.download = `subscriptions-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-3">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} w-auto`} /></label>
        <label className="text-xs text-ink-3">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inp} w-auto`} /></label>
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest">Refresh</button>
        <button onClick={exportCsv} disabled={!r} className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
      </div>
      {!r ? <p className="text-sm text-ink-3">Loading…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Active subscriptions" value={String(r.revenue.activeCount)} />
            <Kpi label="Active MRR" value={inr(r.revenue.activeMrrPaise)} />
            <Kpi label="Avg / delivery (active)" value={inr(r.revenue.avgPerDeliveryPaise)} />
            <Kpi label="Trial conversions" value={String(r.trial.credited)} sub={`${r.trial.eligibleActive} eligible active`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="By status" head={["Status", "Count"]} rows={r.byStatus.map((x) => [x.status, String(x.count)])} />
            <ReportTable title="By plan" head={["Plan", "Subs", "MRR"]} rows={r.byPlan.map((x) => [x.plan, String(x.count), inr(x.mrrPaise)])} />
            <ReportTable title="By zone" head={["Zone", "Count"]} rows={r.byZone.map((x) => [x.zone, String(x.count)])} />
            <ReportTable title="AutoPay" head={["State", "Count"]} rows={[["On", String(r.autopay.on)], ["Off", String(r.autopay.off)]]} />
          </div>
          <ReportTable title={`Renewals due (next 7 days)`} head={["Subscription", "Customer", "Ends", "Plan value"]} rows={r.renewalsDue.map((x) => [x.shortId, x.customer, fmtDate(x.endDate), inr(x.planTotalPaise)])} />
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
