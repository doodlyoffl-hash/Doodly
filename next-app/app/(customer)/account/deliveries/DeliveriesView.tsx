"use client";

import { useResource, StateGate, Card, EmptyState, StatusPill, fmtDay } from "@/components/account/ui";
import type { Delivery } from "@/components/account/delivery-types";

const DONE = new Set(["DELIVERED", "FAILED", "SKIPPED"]);

export function DeliveriesView() {
  const { data, state } = useResource<{ deliveries: Delivery[] }>("/api/deliveries");
  const all = data?.deliveries ?? [];
  const upcoming = all.filter((d) => !DONE.has(d.status)).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const past = all.filter((d) => DONE.has(d.status));

  return (
    <StateGate state={state} signedOutTitle="Sign in to see your deliveries" signedOutBody="Your deliveries appear here once you're signed in.">
      {all.length === 0 ? (
        <EmptyState title="No deliveries scheduled" body="Start a subscription and your morning deliveries will appear here." cta={{ label: "Start a subscription", href: "/subscriptions" }} />
      ) : (
        <div className="space-y-8">
          <Section title="Upcoming" rows={upcoming} empty="No upcoming deliveries." />
          <Section title="Past" rows={past} empty="No past deliveries yet." />
        </div>
      )}
    </StateGate>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Delivery[]; empty: string }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-lg font-semibold text-forest">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-forest">{fmtDay(d.date)}</p>
                <p className="mt-0.5 text-sm text-ink-3">{d.slot ?? "6–8 AM"}{d.driver?.name ? ` · ${d.driver.name}` : ""}</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-ink-2">
                {d.bottlesIn > 0 && <span>↩ {d.bottlesIn} empties</span>}
                <StatusPill status={d.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
