"use client";

import { useState } from "react";
import { inr } from "@/lib/pricing";
import { useResource, StateGate, Card, EmptyState, StatusPill, apiSend, fmtDate } from "@/components/account/ui";

interface Item { qty: number; label: string; ml: number; product: string; dailyPaise: number | null }
interface Sub {
  id: string; status: string; startDate: string; endDate: string | null;
  nextDeliveryAt: string | null; deliverySlot: string; autoRenew: boolean;
  pausedUntil: string | null; skipDates: string[];
  plan: { name: string; days: number; discountBps: number };
  address: { label: string; line1: string; line2: string | null; city: string; pincode: string } | null;
  perDeliveryPaise: number;
  items: Item[];
}

export function SubscriptionView() {
  const { data, state, setData } = useResource<{ subscriptions: Sub[] }>("/api/account/subscription");
  const subs = data?.subscriptions ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "pause" | "resume" | "cancel" | "skip" | "autopay_on" | "autopay_off", extra?: Record<string, unknown>) {
    if (action === "cancel" && !confirm("Cancel this subscription? Your deliveries will stop.")) return;
    setBusy(id + action);
    const res = await apiSend<{ subscriptions: Sub[] }>("/api/account/subscription", "POST", { id, action, ...extra });
    setBusy(null);
    if (res.ok && res.data) setData(res.data);
  }

  return (
    <StateGate state={state} signedOutTitle="Sign in to manage your subscription" signedOutBody="Your subscription appears here once you're signed in.">
      {subs.length === 0 ? (
        <EmptyState title="No subscription yet" body="Start a daily plan to get fresh A2 milk delivered every morning." cta={{ label: "Choose a plan", href: "/subscriptions" }} />
      ) : (
        <div className="space-y-5">
          {subs.map((s) => {
            const active = s.status === "ACTIVE";
            const paused = s.status === "VACATION" || s.status === "PAUSED";
            const ended = s.status === "CANCELLED" || s.status === "COMPLETED";
            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold text-forest">{s.plan.name}</p>
                    <p className="mt-0.5 text-sm text-ink-2">{s.items.map((i) => `${i.qty} × ${i.product} ${i.label}`).join(", ") || "—"}</p>
                  </div>
                  <StatusPill status={s.status} />
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <Info label="Per delivery" value={inr(s.perDeliveryPaise)} />
                  <Info label="Slot" value={s.deliverySlot} />
                  <Info label="Next delivery" value={s.nextDeliveryAt ? fmtDate(s.nextDeliveryAt) : paused ? "Paused" : "—"} />
                  <Info label="Started" value={fmtDate(s.startDate)} />
                  <Info label={ended ? "Ended" : "Renews"} value={s.endDate ? fmtDate(s.endDate) : s.autoRenew ? "Auto-renews" : "—"} />
                  <Info label="Delivers to" value={s.address ? `${s.address.label} · ${s.address.pincode}` : "—"} />
                  <Info label="Auto-pay" value={s.autoRenew ? "On" : "Off"} />
                </div>

                {s.skipDates.length > 0 && (
                  <p className="mt-3 text-xs text-ink-3">Skipped: {s.skipDates.map((d) => fmtDate(d)).join(", ")}</p>
                )}

                {!ended && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    {active && <Btn onClick={() => act(s.id, "skip")} busy={busy === s.id + "skip"} label="Skip next" />}
                    {active && <Btn onClick={() => act(s.id, "pause")} busy={busy === s.id + "pause"} label="Pause (vacation)" />}
                    {paused && <Btn onClick={() => act(s.id, "resume")} busy={busy === s.id + "resume"} label="Resume" primary />}
                    <Btn onClick={() => act(s.id, s.autoRenew ? "autopay_off" : "autopay_on")} busy={busy === s.id + (s.autoRenew ? "autopay_off" : "autopay_on")} label={s.autoRenew ? "Turn off auto-pay" : "Turn on auto-pay"} />
                    <Btn onClick={() => act(s.id, "cancel")} busy={busy === s.id + "cancel"} label="Cancel" danger />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </StateGate>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F6FAF6] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-0.5 font-semibold text-forest">{value}</p>
    </div>
  );
}

function Btn({ onClick, busy, label, primary, danger }: { onClick: () => void; busy: boolean; label: string; primary?: boolean; danger?: boolean }) {
  const cls = primary
    ? "bg-leaf text-white hover:bg-leaf-600"
    : danger
    ? "border border-red-200 text-red-600 hover:bg-red-50"
    : "border border-mint-soft text-forest hover:bg-[#F6FAF6]";
  return (
    <button onClick={onClick} disabled={busy} aria-busy={busy} className={`rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${cls}`}>
      {busy ? "…" : label}
    </button>
  );
}
