"use client";

import { useResource, StateGate, Card, EmptyState, fmtDay, fmtDateTime } from "@/components/account/ui";
import type { Delivery } from "@/components/account/delivery-types";

/* The fulfilment journey we visualise. Real delivery statuses map onto these steps. */
const STEPS = ["SCHEDULED", "PACKED", "OUT_FOR_DELIVERY", "REACHED", "DELIVERED"] as const;
const STEP_LABEL: Record<string, string> = {
  SCHEDULED: "Order scheduled", PACKED: "Packed & chilled", OUT_FOR_DELIVERY: "Out for delivery", REACHED: "Arriving at your door", DELIVERED: "Delivered",
};
// statuses that share a step
const STEP_OF: Record<string, number> = {
  SCHEDULED: 0, ASSIGNED: 0, ACCEPTED: 0, PACKED: 1, OUT_FOR_DELIVERY: 2, ON_THE_WAY: 2, REACHED: 3, DELIVERED: 4,
};
const DONE = new Set(["DELIVERED", "FAILED", "SKIPPED"]);

export function TrackingView() {
  const { data, state } = useResource<{ deliveries: Delivery[] }>("/api/deliveries");
  const all = data?.deliveries ?? [];
  // the soonest not-yet-finished delivery; else the most recent one
  const active = all.filter((d) => !DONE.has(d.status)).sort((a, b) => +new Date(a.date) - +new Date(b.date))[0] ?? all[0];

  return (
    <StateGate state={state} signedOutTitle="Sign in to track deliveries" signedOutBody="Your live delivery status appears here once you're signed in.">
      {!active ? (
        <EmptyState title="Nothing to track right now" body="When you have an upcoming delivery, you'll see its live status here." cta={{ label: "Start a subscription", href: "/subscriptions" }} />
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Delivery for</p>
              <p className="font-display text-xl font-semibold text-forest">{fmtDay(active.date)} · {active.slot ?? "6–8 AM"}</p>
            </div>
            {active.driver?.name && <p className="text-sm text-ink-2">Driver: <span className="font-semibold text-forest">{active.driver.name}</span></p>}
          </div>

          <ol className="mt-6 space-y-0">
            {STEPS.map((step, i) => {
              const current = STEP_OF[active.status] ?? 0;
              const reached = i <= current;
              const isNow = i === current && active.status !== "DELIVERED";
              return (
                <li key={step} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${reached ? "bg-leaf text-white" : "bg-mint-soft text-ink-3"}`}>{reached ? "✓" : i + 1}</span>
                    {i < STEPS.length - 1 && <span className={`h-10 w-0.5 ${i < current ? "bg-leaf" : "bg-mint-soft"}`} />}
                  </div>
                  <div className="pb-6">
                    <p className={`font-semibold ${reached ? "text-forest" : "text-ink-3"}`}>{STEP_LABEL[step]}</p>
                    {isNow && <p className="text-xs font-semibold text-leaf-600">In progress…</p>}
                    {step === "DELIVERED" && active.deliveredAt && <p className="text-xs text-ink-3">{fmtDateTime(active.deliveredAt)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </StateGate>
  );
}
