"use client";

import { useCallback, useEffect, useState } from "react";
import type { BulkListResponse, BulkRow } from "@/lib/bulk/admin-types";
import {
  STATUS_LABEL, allowedNext, EVENT_LABEL, UNIT_LABEL, CONTACT_LABEL, BULK_STATUSES,
  type BulkStatus, type BulkEventType, type BulkQtyUnit, type ContactMethod,
} from "@/lib/bulk/workflow";

const STAT_CARDS: { key: keyof BulkListResponse["stats"]; label: string; filter: BulkStatus | "all" }[] = [
  { key: "total", label: "Total requests", filter: "all" },
  { key: "new", label: "New", filter: "NEW" },
  { key: "contacted", label: "Contacted", filter: "CONTACTED" },
  { key: "quotationSent", label: "Quotation sent", filter: "QUOTATION_SENT" },
  { key: "confirmed", label: "Confirmed", filter: "CONFIRMED" },
  { key: "scheduled", label: "Scheduled", filter: "SCHEDULED" },
  { key: "delivered", label: "Delivered", filter: "DELIVERED" },
  { key: "cancelled", label: "Cancelled", filter: "CANCELLED" },
];

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function BulkOrdersBoard() {
  const [data, setData] = useState<BulkListResponse | null>(null);
  const [filter, setFilter] = useState<BulkStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filter !== "all") qs.set("status", filter);
      if (search.trim()) qs.set("q", search.trim());
      const res = await fetch(`/api/bulk-orders?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
      setData(await res.json()); setError(null);
    } catch (e) { setError((e as Error).message || "Could not load requests"); }
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bulk-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { flash(json?.error ?? "Action failed"); return false; }
      flash(ok); await load(); return true;
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this request? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bulk-orders/${id}`, { method: "DELETE" });
      if (!res.ok) { flash("Could not delete"); return; }
      flash("Request deleted"); setOpenId(null); await load();
    } finally { setBusy(false); }
  }

  const rows = data?.requests ?? [];

  return (
    <div className="space-y-6">
      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_CARDS.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.filter)}
            className={`rounded-2xl border bg-white p-4 text-left transition ${filter === c.filter ? "border-leaf shadow-sm" : "border-mint-soft hover:border-leaf"}`}>
            <p className="font-display text-2xl font-bold text-forest">{(data?.stats[c.key] ?? 0).toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-xs text-ink-3">{c.label}</p>
          </button>
        ))}
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, name, phone, city…"
          className="min-w-[220px] flex-1 rounded-lg border border-mint-soft px-3 py-2 text-sm" />
        <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:border-leaf">Refresh</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      {/* table */}
      <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
            <tr>
              {["Request ID", "Customer", "Phone", "Event", "Event date", "Qty", "Location", "Status", "Created", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BulkRowView key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                busy={busy} onStatus={(s) => patch(r.id, { action: "status", status: s }, `Moved to ${STATUS_LABEL[s]}`)}
                onNote={(body) => patch(r.id, { action: "note", body }, "Note added")}
                onAssign={(assignedToId) => patch(r.id, { action: "assign", assignedToId }, assignedToId ? "Assigned" : "Unassigned")}
                onEdit={(p) => patch(r.id, { action: "edit", patch: p }, "Details updated")}
                onDelete={() => remove(r.id)} />
            ))}
            {!rows.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-ink-3">No requests {filter !== "all" ? "in this status" : "yet"}.</td></tr>}
          </tbody>
        </table>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "NEW" ? "bg-mint-soft text-leaf-600"
    : status === "CANCELLED" ? "bg-red-100 text-red-700"
    : status === "DELIVERED" ? "bg-leaf text-white"
    : "bg-gold-soft text-gold";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{STATUS_LABEL[status as BulkStatus] ?? status}</span>;
}

function BulkRowView({ r, open, onToggle, busy, onStatus, onNote, onAssign, onEdit, onDelete }: {
  r: BulkRow; open: boolean; onToggle: () => void; busy: boolean;
  onStatus: (s: BulkStatus) => void; onNote: (body: string) => void;
  onAssign: (id: string | null) => void; onEdit: (patch: Record<string, unknown>) => void; onDelete: () => void;
}) {
  const [note, setNote] = useState("");
  const [staff, setStaff] = useState(r.assignedToId ?? "");
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState(String(r.quantity));
  const [time, setTime] = useState(r.deliveryTime);
  const cur = r.status as BulkStatus;
  const nextOptions = allowedNext(cur);

  return (
    <>
      <tr className="border-b border-mint-soft/60 align-middle hover:bg-[#FAFCFA]">
        <td className="px-4 py-3 font-semibold text-forest">{r.code}</td>
        <td className="px-4 py-3">{r.fullName}</td>
        <td className="px-4 py-3 text-ink-2">{r.mobile}</td>
        <td className="px-4 py-3 text-ink-2">{EVENT_LABEL[r.eventType as BulkEventType] ?? r.eventType}</td>
        <td className="px-4 py-3 text-ink-2">{fmtDate(r.eventDate)}</td>
        <td className="px-4 py-3 text-ink-2">{r.quantity} {UNIT_LABEL[r.unit as BulkQtyUnit] ?? r.unit}</td>
        <td className="px-4 py-3 text-ink-2">{r.city} · {r.pincode}</td>
        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
        <td className="px-4 py-3 text-ink-3">{fmtDate(r.createdAt)}</td>
        <td className="px-4 py-3 text-right">
          <button onClick={onToggle} className="rounded-full border border-mint-soft px-3 py-1 text-xs font-semibold text-forest hover:border-leaf">{open ? "Close" : "View"}</button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-mint-soft bg-[#F6FAF6]">
          <td colSpan={10} className="px-4 py-5">
            <div className="grid gap-5 lg:grid-cols-2">
              {/* details */}
              <div className="space-y-1.5 text-sm text-ink-2">
                <Detail k="Email" v={r.email ?? "—"} />
                <Detail k="Preferred contact" v={CONTACT_LABEL[r.preferredContact as ContactMethod] ?? r.preferredContact} />
                <Detail k="Delivery" v={`${r.deliveryAddress}, ${r.city} ${r.pincode}`} />
                <Detail k="Delivery time" v={r.deliveryTime} />
                <Detail k="Additional" v={r.additionalRequirements ?? "—"} />
                <Detail k="Instructions" v={r.specialInstructions ?? "—"} />
                <Detail k="Assigned to" v={r.assignedTo?.name ?? (r.assignedToId ? r.assignedToId : "Unassigned")} />
              </div>

              {/* actions */}
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Change status</p>
                  <div className="flex flex-wrap gap-2">
                    {nextOptions.length ? nextOptions.map((s) => (
                      <button key={s} disabled={busy} onClick={() => onStatus(s)}
                        className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{STATUS_LABEL[s]} →</button>
                    )) : <span className="text-xs text-ink-3">No further transitions (terminal).</span>}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Add note</p>
                  <div className="flex gap-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note…" className="flex-1 rounded-lg border border-mint-soft px-3 py-1.5 text-sm" />
                    <button disabled={busy || !note.trim()} onClick={() => { onNote(note); setNote(""); }} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Add</button>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Assign staff (user id)</p>
                  <div className="flex gap-2">
                    <input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="staff user id" className="flex-1 rounded-lg border border-mint-soft px-3 py-1.5 text-sm" />
                    <button disabled={busy} onClick={() => onAssign(staff.trim() || null)} className="rounded-full border border-mint-soft px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-50">Save</button>
                  </div>
                </div>

                <div>
                  <button onClick={() => setEdit((v) => !v)} className="text-xs font-semibold text-leaf-600 underline">{edit ? "Cancel edit" : "Edit details"}</button>
                  {edit && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="text-xs text-ink-3">Qty<input value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" className="ml-2 w-20 rounded-lg border border-mint-soft px-2 py-1 text-sm" /></label>
                      <label className="text-xs text-ink-3">Time<input value={time} onChange={(e) => setTime(e.target.value)} className="ml-2 w-28 rounded-lg border border-mint-soft px-2 py-1 text-sm" /></label>
                      <button disabled={busy} onClick={() => { onEdit({ quantity: Number(q) || r.quantity, deliveryTime: time }); setEdit(false); }} className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Save changes</button>
                    </div>
                  )}
                </div>

                <button disabled={busy} onClick={onDelete} className="text-xs font-semibold text-red-600 underline disabled:opacity-50">Delete request</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return <p><span className="font-semibold text-forest">{k}:</span> {v}</p>;
}
