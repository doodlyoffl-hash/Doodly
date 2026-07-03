"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";

/* Where each role lands after signing in (mirrors lib/auth/roles.ts#homeFor). */
function landingFor(role?: string): string {
  if (role === "delivery_executive") return "/driver/dashboard";
  if (role && role !== "customer") return "/admin/dashboard";
  return "/account/dashboard";
}

/* Accessible, validated login form: labelled inputs, inline errors,
   loading state, and double-submit prevention. onSubmit calls Auth.js
   (Credentials) and routes the user to their role's dashboard. */
export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;                                  // prevent duplicate submissions
    if (!identifier.trim() || !password) { setError("Please enter your phone/email and password."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await signIn("credentials", { identifier: identifier.trim(), password, redirect: false });
      if (!res || res.error) {
        setError("We couldn't sign you in. Please check your details and try again.");
        setBusy(false);
        return;
      }
      const session = await getSession();
      const from = new URLSearchParams(window.location.search).get("from");
      router.push(from && from.startsWith("/") ? from : landingFor(session?.user?.role));
      router.refresh();
    } catch {
      setError("We couldn't sign you in. Please check your details and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-forest to-[#0a2e22] p-12 text-white md:flex">
        <Image src="/logo.png" alt="DOODLY home" width={150} height={55} className="h-11 w-auto" priority />
        <div>
          <h2 className="font-display text-3xl">Fresh milk,<br />delivered daily.</h2>
          <ul className="mt-6 space-y-3 text-white/90">
            <li>A2 buffalo milk, no preservatives</li>
            <li>Returnable glass bottles</li>
            <li>At your door by 7 AM</li>
          </ul>
        </div>
        <span className="text-sm text-white/60">© {new Date().getFullYear()} DOODLY</span>
      </aside>

      <main id="main-content" className="grid place-items-center p-8">
        <div className="w-full max-w-sm">
          <Image src="/logo.png" alt="DOODLY" width={150} height={55} className="h-11 w-auto md:hidden" priority />
          <h1 className="mt-6 font-display text-2xl text-forest">Welcome back</h1>
          <p className="mt-1 text-ink-2">Log in to manage your milk, deliveries and bottles.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <div>
              <label htmlFor="login-id" className="mb-1 block text-sm font-semibold text-forest">Phone or email</label>
              <input id="login-id" name="identifier" type="text" inputMode="email" autoComplete="username" required
                value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined}
                className="w-full rounded-xl border border-mint-soft px-4 py-3 outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30" placeholder="+91 98480 11234" />
            </div>
            <div>
              <label htmlFor="login-pw" className="mb-1 block text-sm font-semibold text-forest">Password</label>
              <input id="login-pw" name="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined}
                className="w-full rounded-xl border border-mint-soft px-4 py-3 outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30" placeholder="••••••••" />
            </div>

            {error && <p id="login-error" role="alert" className="text-sm font-semibold text-red-600">{error}</p>}

            <button type="submit" disabled={busy} aria-busy={busy}
              className="block w-full rounded-full bg-leaf py-3 text-center font-semibold text-white transition disabled:opacity-60">
              {busy ? "Signing in…" : "Log in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-3">
            New to DOODLY? <Link href="/signup" className="font-bold text-leaf-600">Create an account</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
