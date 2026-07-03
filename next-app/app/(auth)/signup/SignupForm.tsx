"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { authInputClass, authButtonClass } from "../AuthShell";

/* Create-account form: validates inline, calls /api/auth/register, then signs
   the new customer in via Auth.js and routes to their dashboard. */
export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !email.trim() || !password) { setError("Please fill in your name, email and password."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "We couldn't create your account. Please try again.");
        setBusy(false);
        return;
      }
      // establish the session
      const signin = await signIn("credentials", { identifier: email.trim(), password, redirect: false });
      if (!signin || signin.error) {
        // account created but auto sign-in failed — send them to login
        router.push("/login");
        return;
      }
      router.push("/account/dashboard");
      router.refresh();
    } catch {
      setError("We couldn't create your account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="su-name" className="mb-1 block text-sm font-semibold text-forest">Full name</label>
          <input id="su-name" name="name" type="text" autoComplete="name" required
            value={name} onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error} className={authInputClass} placeholder="Anjali Rao" />
        </div>
        <div>
          <label htmlFor="su-email" className="mb-1 block text-sm font-semibold text-forest">Email</label>
          <input id="su-email" name="email" type="email" inputMode="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error} className={authInputClass} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="su-phone" className="mb-1 block text-sm font-semibold text-forest">Phone <span className="font-normal text-ink-3">(optional)</span></label>
          <input id="su-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel"
            value={phone} onChange={(e) => setPhone(e.target.value)}
            className={authInputClass} placeholder="+91 98480 11234" />
        </div>
        <div>
          <label htmlFor="su-pw" className="mb-1 block text-sm font-semibold text-forest">Password</label>
          <input id="su-pw" name="password" type="password" autoComplete="new-password" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error} aria-describedby="su-pw-hint" className={authInputClass} placeholder="••••••••" />
          <p id="su-pw-hint" className="mt-1 text-xs text-ink-3">At least 8 characters, with a letter and a number.</p>
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}

        <button type="submit" disabled={busy} aria-busy={busy} className={authButtonClass}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-3">
        Already have an account? <Link href="/login" className="font-bold text-leaf-600">Log in</Link>
      </p>
    </>
  );
}
