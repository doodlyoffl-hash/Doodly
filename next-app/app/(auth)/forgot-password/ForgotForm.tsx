"use client";

import { useState } from "react";
import Link from "next/link";
import { authInputClass, authButtonClass } from "../AuthShell";

/* Request a reset link. Always shows the same confirmation (the API never
   reveals whether an account exists). */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) { setError("Please enter your email."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok && res.status !== 200) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error || "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-mint-soft bg-mint-soft/40 p-5">
        <p className="font-semibold text-forest">Check your inbox</p>
        <p className="mt-1 text-sm text-ink-2">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </p>
        <Link href="/login" className="mt-4 inline-block font-bold text-leaf-600">Back to log in</Link>
      </div>
    );
  }

  return (
    <>
      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="fp-email" className="mb-1 block text-sm font-semibold text-forest">Email</label>
          <input id="fp-email" name="email" type="email" inputMode="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error} className={authInputClass} placeholder="you@example.com" />
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}

        <button type="submit" disabled={busy} aria-busy={busy} className={authButtonClass}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-3">
        Remembered it? <Link href="/login" className="font-bold text-leaf-600">Log in</Link>
      </p>
    </>
  );
}
