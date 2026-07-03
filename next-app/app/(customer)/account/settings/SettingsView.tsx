"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Card, apiSend } from "@/components/account/ui";

const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function SettingsView() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErrs({});
    if (next.length < 8) { setErrs({ newPassword: "Password must be at least 8 characters." }); return; }
    if (next !== confirm) { setErrs({ confirm: "Passwords don't match." }); return; }
    setBusy(true);
    const res = await apiSend("/api/account/password", "POST", { currentPassword: cur, newPassword: next });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: "Password updated." }); setCur(""); setNext(""); setConfirm(""); }
    else { setMsg({ ok: false, text: res.error ?? "Couldn't update password." }); if (res.details) setErrs(res.details); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="font-display text-lg font-semibold text-forest">Change password</h3>
        <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
          <Field label="Current password" error={errs.currentPassword}>
            <input className={inputCls} type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" error={errs.newPassword}>
            <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={errs.confirm}>
            <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          {msg && <p role="alert" className={`text-sm font-semibold ${msg.ok ? "text-leaf-600" : "text-red-600"}`}>{msg.text}</p>}
          <button type="submit" disabled={busy} aria-busy={busy}
            className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </Card>

      <Card>
        <h3 className="font-display text-lg font-semibold text-forest">Session</h3>
        <p className="mt-2 text-sm text-ink-2">Sign out of your account on this device.</p>
        <button onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-4 rounded-full border border-mint-soft px-6 py-2.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">
          Sign out
        </button>
      </Card>
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
