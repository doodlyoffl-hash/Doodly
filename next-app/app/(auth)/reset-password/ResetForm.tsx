"use client";

import { useState } from "react";
import Link from "next/link";
import { authInputClass, authButtonClass } from "../AuthShell";

/* Set a new password using the token from the emailed link. */
export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("The passwords don't match."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "We couldn't reset your password. Please request a new link.");
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't reset your password. Please try again.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-700">Invalid reset link</p>
        <p className="mt-1 text-sm text-ink-2">This link is missing its token. Please request a new one.</p>
        <Link href="/forgot-password" className="mt-4 inline-block font-bold text-leaf-600">Request a new link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-mint-soft bg-mint-soft/40 p-5">
        <p className="font-semibold text-forest">Password updated</p>
        <p className="mt-1 text-sm text-ink-2">Your password has been reset. You can now log in with your new password.</p>
        <Link href="/login" className="mt-4 inline-block font-bold text-leaf-600">Go to log in</Link>
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor="rp-pw" className="mb-1 block text-sm font-semibold text-forest">New password</label>
        <input id="rp-pw" name="password" type="password" autoComplete="new-password" required minLength={8}
          value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error} aria-describedby="rp-hint" className={authInputClass} placeholder="••••••••" />
        <p id="rp-hint" className="mt-1 text-xs text-ink-3">At least 8 characters, with a letter and a number.</p>
      </div>
      <div>
        <label htmlFor="rp-confirm" className="mb-1 block text-sm font-semibold text-forest">Confirm new password</label>
        <input id="rp-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8}
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={!!error} className={authInputClass} placeholder="••••••••" />
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}

      <button type="submit" disabled={busy} aria-busy={busy} className={authButtonClass}>
        {busy ? "Updating…" : "Reset password"}
      </button>
    </form>
  );
}
