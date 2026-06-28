"use client";

import { useState } from "react";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");            // honeypot (bots fill this; humans never see it)
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;            // prevent duplicate submissions
    if (hp) { setState("done"); return; }        // silently drop bots
    if (!EMAIL.test(email)) { setState("error"); setMsg("Please enter a valid email address."); return; }
    setState("loading"); setMsg("");
    try {
      // await fetch("/api/newsletter", { method:"POST", body: JSON.stringify({ email }) })
      await new Promise((r) => setTimeout(r, 700));
      setState("done"); setEmail("");
    } catch {
      setState("error"); setMsg("Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return <p className="rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold text-mint" role="status">✓ You&apos;re in — fresh tips & offers headed your way.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
      <label htmlFor="nl-email" className="sr-only">Email address</label>
      <div className="flex overflow-hidden rounded-full border border-white/20 bg-white/10 focus-within:border-mint">
        <input
          id="nl-email" type="email" inputMode="email" autoComplete="email" required
          value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          aria-invalid={state === "error"} aria-describedby={state === "error" ? "nl-error" : undefined}
          placeholder="Your email" className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none"
        />
        <button type="submit" disabled={state === "loading"} aria-busy={state === "loading"}
          className="flex-shrink-0 bg-leaf px-5 text-sm font-semibold text-white transition disabled:opacity-60">
          {state === "loading" ? "…" : "Join"}
        </button>
      </div>
      {/* honeypot — visually hidden, not announced; bots fill it */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={hp} onChange={(e) => setHp(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 opacity-0" name="company" />
      {state === "error" && <p id="nl-error" role="alert" className="text-xs font-semibold text-red-300">{msg}</p>}
    </form>
  );
}
