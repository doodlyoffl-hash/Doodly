"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData, ExecCardData } from "@/lib/assignment/dashboard-types";

const SLOTS = ["06:00-08:00", "08:00-10:00", "17:00-19:00"];
const REFRESH_MS = 15_000;

const todayISO = () => new Date().toISOString().slice(0, 10);

type DragPayload = { deliveryId: string; from: string }; // from = driverId or "queue"

export function AssignmentBoard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragging = useRef(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ date });
      if (slot !== "all") qs.set("slot", slot);
      const res = await fetch(`/api/assignments/dashboard?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load dashboard");
    }
  }, [date, slot]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { if (!dragging.current) load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  // ---- mutations ----
  async function override(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/assignments/override", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { flash(json?.error ?? "Action failed"); return false; }
      await load();
      return true;
    } finally { setBusy(false); }
  }

  async function runAuto() {
    if (slot === "all") { flash("Pick a specific slot to auto-assign."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/assignments/auto", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, slot }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { flash(json?.error ?? "Auto-assignment failed"); return; }
      flash(`Assigned ${json.assignedBottles ?? 0} bottles to ${json.executives ?? 0} executives · ${json.queuedBottles ?? 0} queued.`);
      await load();
    } finally { setBusy(false); }
  }

  async function markReturned(driverId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/assignments/return", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { flash(json?.error ?? "Return failed"); return; }
      flash(json.assigned ? `New trip: ${json.assigned} stops from the queue.` : "Executive returned. Queue empty.");
      await load();
    } finally { setBusy(false); }
  }

  // ---- drag & drop ----
  const onDragStart = (payload: DragPayload) => (e: React.DragEvent) => {
    dragging.current = true;
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => { dragging.current = false; };
  const allowDrop = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const dropOnExec = (driverId: string) => async (e: React.DragEvent) => {
    e.preventDefault(); dragging.current = false;
    const p = parsePayload(e); if (!p || p.from === driverId) return;
    if (p.from === "queue") await override({ action: "manual", deliveryId: p.deliveryId, driverId });
    else await override({ action: "reassign", deliveryId: p.deliveryId, toDriverId: driverId });
  };
  const dropOnQueue = async (e: React.DragEvent) => {
    e.preventDefault(); dragging.current = false;
    const p = parsePayload(e); if (!p || p.from === "queue") return;
    await override({ action: "unassign", deliveryId: p.deliveryId });
  };

  // ---- derived ----
  const execs = useMemo(() => {
    let list = data?.executives ?? [];
    if (search.trim()) list = list.filter((x) => x.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (statusFilter !== "all") list = list.filter((x) => x.availability === statusFilter);
    return list;
  }, [data, search, statusFilter]);

  const t = data?.totals;

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-mint-soft bg-white p-4">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-mint-soft px-3 py-2 text-sm" /></Field>
        <Field label="Slot">
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className="rounded-lg border border-mint-soft px-3 py-2 text-sm">
            <option value="all">All slots</option>
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Search executive"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name…" className="rounded-lg border border-mint-soft px-3 py-2 text-sm" /></Field>
        <Field label="Status">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-mint-soft px-3 py-2 text-sm">
            {["all", "AVAILABLE", "ASSIGNED", "ACCEPTED", "OUT_FOR_DELIVERY", "RETURNED_TO_DAIRY", "OFFLINE", "BREAK"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-2"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Auto-refresh</label>
          <button onClick={load} className="rounded-full border border-mint-soft px-4 py-2 text-sm font-semibold text-forest hover:border-leaf">Refresh</button>
          <button onClick={runAuto} disabled={busy} className="rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-60">Run auto-assign</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      {/* stats */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat n={t?.orders ?? 0} l="Total orders" />
        <Stat n={t?.totalBottles ?? 0} l="Total bottles" />
        <Stat n={t?.assignedBottles ?? 0} l="Assigned bottles" tone="leaf" />
        <Stat n={t?.pendingBottles ?? 0} l="Pending bottles" tone={t && t.pendingBottles > 0 ? "gold" : undefined} />
        <Stat n={t?.completedDeliveries ?? 0} l="Completed" />
        <Stat n={data?.executiveCounts.available ?? 0} l="Available execs" />
        <Stat n={data?.executiveCounts.onRoute ?? 0} l="On route" />
        <Stat n={data?.executiveCounts.returned ?? 0} l="Returned" />
        <Stat n={t?.queueCount ?? 0} l="Remaining queue" tone={t && t.queueCount > 0 ? "gold" : undefined} />
        <Stat n={t?.totalExecutives ?? 0} l="Total executives" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* executives */}
        <div className="grid gap-4 sm:grid-cols-2">
          {execs.map((ex) => (
            <ExecCard key={ex.driverId} ex={ex} onDrop={dropOnExec(ex.driverId)} allowDrop={allowDrop}
              onDragStart={onDragStart} onDragEnd={onDragEnd}
              onReturn={() => markReturned(ex.driverId)}
              onLock={(deliveryId, locked) => override({ action: "lock", deliveryId, locked })} />
          ))}
          {!execs.length && <p className="text-sm text-ink-3">No executives match your filters.</p>}
        </div>

        {/* pending queue */}
        <aside className="rounded-2xl border border-mint-soft bg-white p-4" onDragOver={allowDrop} onDrop={dropOnQueue}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-forest">Pending queue</h3>
            <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-bold text-gold">{data?.totals.pendingBottles ?? 0} bottles</span>
          </div>
          <p className="mt-1 text-xs text-ink-3">Drag a delivery here to unassign it.</p>
          <ul className="mt-3 space-y-2">
            {(data?.queue ?? []).map((q) => (
              <li key={q.deliveryId} draggable onDragStart={onDragStart({ deliveryId: q.deliveryId, from: "queue" })} onDragEnd={onDragEnd}
                className="flex cursor-grab items-center justify-between rounded-lg border border-mint-soft bg-milk px-3 py-2 text-sm active:cursor-grabbing">
                <span className="truncate"><span className="font-semibold text-forest">{q.bottles}🍶</span> <span className="text-ink-3">{q.area ?? "—"}</span></span>
                {q.reason && <span className="ml-2 shrink-0 text-[11px] text-ink-3">{q.reason}</span>}
              </li>
            ))}
            {!(data?.queue?.length) && <li className="rounded-lg border border-dashed border-mint-soft px-3 py-6 text-center text-xs text-ink-3">Queue is empty 🎉</li>}
          </ul>
        </aside>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}

// ---- sub-components ----

function ExecCard({ ex, onDrop, allowDrop, onDragStart, onDragEnd, onReturn, onLock }: {
  ex: ExecCardData;
  onDrop: (e: React.DragEvent) => void;
  allowDrop: (e: React.DragEvent) => void;
  onDragStart: (p: DragPayload) => (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onReturn: () => void;
  onLock: (deliveryId: string, locked: boolean) => void;
}) {
  const pct = Math.min(100, ex.pct);
  const barColor = ex.pct >= 100 ? "bg-red-500" : ex.pct >= 80 ? "bg-leaf" : "bg-mint";
  const canReturn = ex.availability === "OUT_FOR_DELIVERY" || ex.availability === "ACCEPTED" || ex.availability === "ASSIGNED";
  return (
    <div onDragOver={allowDrop} onDrop={onDrop} className="rounded-2xl border border-mint-soft bg-white p-4 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-semibold text-forest">{ex.name}</p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3">
            <span className={`h-2 w-2 rounded-full ${dot(ex.availability)}`} />{ex.availability.replace(/_/g, " ").toLowerCase()}
          </span>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold text-forest">{ex.assignedBottles}<span className="text-sm font-medium text-ink-3"> / {ex.capacity}</span></p>
          <p className="text-xs text-ink-3">{ex.stops} stops · {ex.pct}%</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-mint-soft" role="progressbar" aria-valuenow={ex.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {ex.deliveries.map((d) => (
          <li key={d.deliveryId} draggable={!d.locked} onDragStart={onDragStart({ deliveryId: d.deliveryId, from: ex.driverId })} onDragEnd={onDragEnd}
            className={`group flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${d.locked ? "border-gold bg-gold-soft" : "cursor-grab border-mint-soft bg-milk active:cursor-grabbing"}`}>
            <span className="font-semibold text-forest">{d.bottles}🍶</span>
            <button type="button" onClick={() => onLock(d.deliveryId, !d.locked)} title={d.locked ? "Unlock" : "Lock"} className="text-ink-3 hover:text-forest">{d.locked ? "🔒" : "🔓"}</button>
          </li>
        ))}
        {!ex.deliveries.length && <li className="text-xs text-ink-3">Drop deliveries here</li>}
      </ul>

      {canReturn && (
        <button onClick={onReturn} className="mt-3 w-full rounded-full border border-mint-soft py-2 text-xs font-semibold text-forest hover:border-leaf">
          Mark returned → pull next batch
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{label}{children}</label>;
}

function Stat({ n, l, tone }: { n: number; l: string; tone?: "leaf" | "gold" }) {
  const color = tone === "leaf" ? "text-leaf-600" : tone === "gold" ? "text-gold" : "text-forest";
  return (
    <div className="rounded-2xl border border-mint-soft bg-white p-4">
      <p className={`font-display text-2xl font-bold ${color}`}>{n.toLocaleString("en-IN")}</p>
      <p className="mt-0.5 text-xs text-ink-3">{l}</p>
    </div>
  );
}

function dot(a: string) {
  if (a === "AVAILABLE" || a === "RETURNED_TO_DAIRY") return "bg-leaf";
  if (a === "OFFLINE" || a === "BREAK") return "bg-ink-3";
  return "bg-gold";
}

function parsePayload(e: React.DragEvent): DragPayload | null {
  try { return JSON.parse(e.dataTransfer.getData("text/plain")) as DragPayload; } catch { return null; }
}
