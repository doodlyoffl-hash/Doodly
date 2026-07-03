"use client";

import { useEffect, useState } from "react";
import { useResource, StateGate, Card, apiSend } from "@/components/account/ui";

interface Config { id: string; enabled: boolean; amountPaise: number; eligiblePlanSlugs: string[]; expiryDays: number | null; updatedAt: string }
const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15 disabled:bg-[#F6FAF6] disabled:text-ink-3";

export function SettingsView() {
  const { data, state } = useResource<{ config: Config; canEdit: boolean }>("/api/admin/settings");
  const canEdit = !!data?.canEdit;

  const [enabled, setEnabled] = useState(true);
  const [amount, setAmount] = useState("");
  const [plans, setPlans] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const c = data?.config;
    if (c) { setEnabled(c.enabled); setAmount(String(c.amountPaise / 100)); setPlans(c.eligiblePlanSlugs.join(", ")); setExpiry(c.expiryDays != null ? String(c.expiryDays) : ""); }
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await apiSend("/api/admin/settings", "PATCH", {
      enabled,
      amountPaise: Math.round(parseFloat(amount || "0") * 100),
      eligiblePlanSlugs: plans.split(",").map((s) => s.trim()).filter(Boolean),
      expiryDays: expiry ? Number(expiry) : null,
    });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Settings saved." } : { ok: false, text: res.error ?? "Couldn't save." });
  }

  return (
    <StateGate state={state}>
      <Card className="max-w-2xl">
        <h3 className="font-display text-lg font-semibold text-forest">Trial Pack cashback & rewards</h3>
        {!canEdit && <p className="mt-2 rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">View only — a Super Admin can change these settings.</p>}
        <form onSubmit={save} className="mt-4 space-y-4" noValidate>
          <label className="flex items-center gap-2 text-sm font-semibold text-forest"><input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} /> Cashback enabled</label>
          <Field label="Cashback amount (₹)"><input className={inputCls} type="number" step="0.01" value={amount} disabled={!canEdit} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Eligible plan slugs (comma-separated)"><input className={inputCls} value={plans} disabled={!canEdit} onChange={(e) => setPlans(e.target.value)} placeholder="p30, p90" /></Field>
          <Field label="Wallet credit expiry (days, blank = never)"><input className={inputCls} type="number" value={expiry} disabled={!canEdit} onChange={(e) => setExpiry(e.target.value)} /></Field>
          {msg && <p role="alert" className={`text-sm font-semibold ${msg.ok ? "text-leaf-600" : "text-red-600"}`}>{msg.text}</p>}
          {canEdit && <button type="submit" disabled={busy} className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">{busy ? "Saving…" : "Save settings"}</button>}
        </form>
      </Card>
    </StateGate>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-semibold text-forest">{label}</label>{children}</div>;
}
