"use client";

import { useState } from "react";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, Card, EmptyState, apiSend, fmtDate } from "@/components/account/ui";

interface Proc {
  id: string; batchNo: string; collectedAt: string; litres: number; fatPct: number; snfPct: number; accepted: boolean; amountPaise: number;
  farmer: { id: string; name: string; village: string };
  qualityTest: { passed: boolean } | null;
}
interface Farmer { id: string; name: string; active: boolean }
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";
const empty = { farmerId: "", batchNo: "", litres: "", fatPct: "", snfPct: "", lactometer: "", temperatureC: "" };

export function ProcurementBoard() {
  const { data, state, reload } = useResource<{ procurements: Proc[] }>("/api/admin/procurement");
  const farmers = useResource<{ farmers: Farmer[] }>("/api/admin/farmers");
  const procs = data?.procurements ?? [];
  const farmerList = (farmers.data?.farmers ?? []).filter((f) => f.active);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...empty });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create"); setErr(null); setErrs({});
    const num = (v: string) => (v === "" ? undefined : Number(v));
    const res = await apiSend("/api/admin/procurement", "POST", {
      farmerId: draft.farmerId, batchNo: draft.batchNo, litres: num(draft.litres), fatPct: num(draft.fatPct), snfPct: num(draft.snfPct),
      lactometer: num(draft.lactometer), temperatureC: num(draft.temperatureC),
    });
    setBusy(null);
    if (res.ok) { setAdding(false); setDraft({ ...empty }); reload(); }
    else { setErr(res.error ?? "Couldn't record collection."); if (res.details) setErrs(res.details); }
  }
  async function setAccepted(p: Proc, accepted: boolean) {
    setBusy(p.id);
    const res = await apiSend(`/api/admin/procurement/${p.id}`, "PATCH", { accepted });
    setBusy(null);
    if (res.ok) reload(); else alert(res.error);
  }

  return (
    <div className="space-y-4">
      <button onClick={() => { setAdding((a) => !a); setErr(null); setErrs({}); }} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600">{adding ? "Close" : "+ Record collection"}</button>

      {adding && (
        <Card>
          <h3 className="font-display text-lg font-semibold text-forest">New collection batch</h3>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-3" noValidate>
            <Field label="Farmer" error={errs.farmerId}>
              <select className={inputCls} value={draft.farmerId} onChange={(e) => setDraft({ ...draft, farmerId: e.target.value })}>
                <option value="">— Select —</option>
                {farmerList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Batch no." error={errs.batchNo}><input className={inputCls} value={draft.batchNo} onChange={(e) => setDraft({ ...draft, batchNo: e.target.value })} placeholder="BATCH-0007" /></Field>
            <Field label="Litres" error={errs.litres}><input className={inputCls} type="number" step="0.1" value={draft.litres} onChange={(e) => setDraft({ ...draft, litres: e.target.value })} /></Field>
            <Field label="Fat %" error={errs.fatPct}><input className={inputCls} type="number" step="0.1" value={draft.fatPct} onChange={(e) => setDraft({ ...draft, fatPct: e.target.value })} /></Field>
            <Field label="SNF %" error={errs.snfPct}><input className={inputCls} type="number" step="0.1" value={draft.snfPct} onChange={(e) => setDraft({ ...draft, snfPct: e.target.value })} /></Field>
            <Field label="Lactometer"><input className={inputCls} type="number" step="0.1" value={draft.lactometer} onChange={(e) => setDraft({ ...draft, lactometer: e.target.value })} /></Field>
            {err && <p role="alert" className="sm:col-span-3 text-sm font-semibold text-red-600">{err}</p>}
            <div className="sm:col-span-3"><button type="submit" disabled={busy === "create"} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy === "create" ? "Saving…" : "Record"}</button></div>
          </form>
        </Card>
      )}

      <StateGate state={state}>
        {procs.length === 0 ? (
          <EmptyState title="No collections yet" body="Record your first milk collection batch." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Batch", "Farmer", "Date", "Litres", "Fat/SNF", "Amount", "Quality", "Status"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {procs.map((p) => (
                  <tr key={p.id} className="border-b border-mint-soft/60">
                    <td className="px-4 py-3 font-mono text-xs text-forest">{p.batchNo}</td>
                    <td className="px-4 py-3"><div className="font-semibold text-forest">{p.farmer.name}</div><div className="text-xs text-ink-3">{p.farmer.village}</div></td>
                    <td className="px-4 py-3 text-ink-2">{fmtDate(p.collectedAt)}</td>
                    <td className="px-4 py-3 text-ink-2">{p.litres} L</td>
                    <td className="px-4 py-3 text-ink-2">{p.fatPct.toFixed(1)} / {p.snfPct.toFixed(1)}</td>
                    <td className="px-4 py-3 font-semibold text-forest">{inr(p.amountPaise)}</td>
                    <td className="px-4 py-3">{p.qualityTest ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.qualityTest.passed ? "bg-mint-soft text-leaf-600" : "bg-red-50 text-red-700"}`}>{p.qualityTest.passed ? "Passed" : "Failed"}</span> : <span className="text-xs text-ink-3">Untested</span>}</td>
                    <td className="px-4 py-3">
                      {p.accepted
                        ? <button onClick={() => setAccepted(p, false)} disabled={busy === p.id} className="rounded-full bg-mint-soft px-2.5 py-0.5 text-xs font-semibold text-leaf-600">Accepted</button>
                        : <button onClick={() => setAccepted(p, true)} disabled={busy === p.id} className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">Rejected</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StateGate>
    </div>
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
