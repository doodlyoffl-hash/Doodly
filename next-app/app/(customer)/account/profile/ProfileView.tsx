"use client";

import { useEffect, useState } from "react";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, Card, apiSend } from "@/components/account/ui";

interface Profile {
  id: string; name: string | null; email: string | null; phone: string | null;
  loyaltyPoints: number; walletPaise: number; referralCode: string; createdAt: string;
}

const inputCls = "w-full rounded-xl border border-mint-soft bg-white px-4 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/15";

export function ProfileView() {
  const { data, state } = useResource<{ profile: Profile }>("/api/account/profile");
  const p = data?.profile;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (p) { setName(p.name ?? ""); setEmail(p.email ?? ""); setPhone(p.phone ?? ""); }
  }, [p]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErrs({});
    const res = await apiSend("/api/account/profile", "PATCH", { name: name.trim(), email: email.trim(), phone: phone.trim() || "" });
    setBusy(false);
    if (res.ok) setMsg({ ok: true, text: "Profile updated." });
    else { setMsg({ ok: false, text: res.error ?? "Couldn't save." }); if (res.details) setErrs(res.details); }
  }

  return (
    <StateGate state={state} signedOutTitle="Sign in to view your profile" signedOutBody="Your profile appears here once you're signed in.">
      {p && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card>
            <form onSubmit={onSave} className="space-y-4" noValidate>
              <Field label="Full name" error={errs.name}>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label="Email" error={errs.email}>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Phone" error={errs.phone}>
                <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91 98480 11234" />
              </Field>

              {msg && <p role="alert" className={`text-sm font-semibold ${msg.ok ? "text-leaf-600" : "text-red-600"}`}>{msg.text}</p>}

              <button type="submit" disabled={busy} aria-busy={busy}
                className="rounded-full bg-leaf px-6 py-2.5 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-60">
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          </Card>

          <div className="space-y-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Wallet balance</p>
              <p className="mt-1 font-display text-2xl font-bold text-forest">{inr(p.walletPaise)}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Reward points</p>
              <p className="mt-1 font-display text-2xl font-bold text-forest">{p.loyaltyPoints.toLocaleString("en-IN")}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Your referral code</p>
              <p className="mt-1 select-all font-mono text-lg font-bold text-leaf-600">{p.referralCode.slice(0, 10).toUpperCase()}</p>
            </Card>
          </div>
        </div>
      )}
    </StateGate>
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
