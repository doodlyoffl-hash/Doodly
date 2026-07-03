"use client";

import { useState } from "react";
import { useResource, StateGate, Card, EmptyState, fmtDate, apiSend } from "@/components/account/ui";

interface Test {
  id: string; fatPct: number; snfPct: number; lactometer: number; temperatureC: number; passed: boolean; rejectReason: string | null; testedAt: string;
  procurement: { batchNo: string; litres: number; farmer: { name: string } };
}
interface Untested { id: string; batchNo: string; litres: number; fatPct: number; snfPct: number; collectedAt: string; farmer: { name: string } }
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function QualityBoard() {
  const { data, state, reload } = useResource<{ tests: Test[]; untested: Untested[] }>("/api/admin/quality");
  const tests = data?.tests ?? [];
  const untested = data?.untested ?? [];

  const [testing, setTesting] = useState<Untested | null>(null);
  const [form, setForm] = useState({ fatPct: "", snfPct: "", lactometer: "", temperatureC: "", passed: true, rejectReason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startTest(u: Untested) {
    setTesting(u);
    setForm({ fatPct: String(u.fatPct), snfPct: String(u.snfPct), lactometer: "", temperatureC: "4", passed: true, rejectReason: "" });
    setErr(null);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!testing) return;
    setBusy(true); setErr(null);
    const res = await apiSend("/api/admin/quality", "POST", {
      procurementId: testing.id, fatPct: Number(form.fatPct), snfPct: Number(form.snfPct),
      lactometer: Number(form.lactometer), temperatureC: Number(form.temperatureC),
      passed: form.passed, rejectReason: form.passed ? undefined : form.rejectReason || undefined,
    });
    setBusy(false);
    if (res.ok) { setTesting(null); reload(); } else setErr(res.error ?? "Couldn't save test.");
  }

  return (
    <StateGate state={state}>
      <div className="space-y-6">
        {/* queue */}
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold text-forest">Awaiting test <span className="text-sm font-normal text-ink-3">({untested.length})</span></h3>
          {untested.length === 0 ? <p className="text-sm text-ink-3">All collected batches have been tested. 🧪</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {untested.map((u) => (
                <Card key={u.id}>
                  <p className="font-mono text-xs text-forest">{u.batchNo}</p>
                  <p className="mt-1 font-semibold text-forest">{u.farmer.name}</p>
                  <p className="text-xs text-ink-3">{u.litres} L · fat {u.fatPct.toFixed(1)} · {fmtDate(u.collectedAt)}</p>
                  <button onClick={() => startTest(u)} className="mt-3 rounded-full bg-leaf px-4 py-1.5 text-sm font-semibold text-white hover:bg-leaf-600">Test this batch</button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {testing && (
          <Card>
            <h3 className="font-display text-lg font-semibold text-forest">Test {testing.batchNo} — {testing.farmer.name}</h3>
            <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-4" noValidate>
              <Field label="Fat %"><input className={inputCls} type="number" step="0.1" value={form.fatPct} onChange={(e) => setForm({ ...form, fatPct: e.target.value })} required /></Field>
              <Field label="SNF %"><input className={inputCls} type="number" step="0.1" value={form.snfPct} onChange={(e) => setForm({ ...form, snfPct: e.target.value })} required /></Field>
              <Field label="Lactometer"><input className={inputCls} type="number" step="0.1" value={form.lactometer} onChange={(e) => setForm({ ...form, lactometer: e.target.value })} required /></Field>
              <Field label="Temp °C"><input className={inputCls} type="number" step="0.1" value={form.temperatureC} onChange={(e) => setForm({ ...form, temperatureC: e.target.value })} required /></Field>
              <div className="sm:col-span-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-forest"><input type="radio" checked={form.passed} onChange={() => setForm({ ...form, passed: true })} /> Pass</label>
                <label className="flex items-center gap-2 text-sm font-semibold text-red-600"><input type="radio" checked={!form.passed} onChange={() => setForm({ ...form, passed: false })} /> Fail</label>
                {!form.passed && <input className={`${inputCls} flex-1`} value={form.rejectReason} onChange={(e) => setForm({ ...form, rejectReason: e.target.value })} placeholder="Reason for rejection" />}
              </div>
              {err && <p role="alert" className="sm:col-span-4 text-sm font-semibold text-red-600">{err}</p>}
              <div className="sm:col-span-4 flex gap-3">
                <button type="submit" disabled={busy} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy ? "Saving…" : "Record test"}</button>
                <button type="button" onClick={() => setTesting(null)} className="rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Cancel</button>
              </div>
            </form>
          </Card>
        )}

        {/* recent tests */}
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold text-forest">Recent tests</h3>
          {tests.length === 0 ? <EmptyState title="No tests yet" body="Test a batch from the queue above." /> : (
            <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
                  <tr>{["Batch", "Farmer", "Fat/SNF", "Lacto/Temp", "Result", "Tested"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.id} className="border-b border-mint-soft/60">
                      <td className="px-4 py-3 font-mono text-xs text-forest">{t.procurement.batchNo}</td>
                      <td className="px-4 py-3 text-ink-2">{t.procurement.farmer.name}</td>
                      <td className="px-4 py-3 text-ink-2">{t.fatPct.toFixed(1)} / {t.snfPct.toFixed(1)}</td>
                      <td className="px-4 py-3 text-ink-2">{t.lactometer.toFixed(1)} / {t.temperatureC.toFixed(1)}°</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.passed ? "bg-mint-soft text-leaf-600" : "bg-red-50 text-red-700"}`}>{t.passed ? "Passed" : "Failed"}</span>
                        {!t.passed && t.rejectReason && <span className="ml-2 text-xs italic text-ink-3">{t.rejectReason}</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-3">{fmtDate(t.testedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </StateGate>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-semibold text-forest">{label}</label>{children}</div>;
}
