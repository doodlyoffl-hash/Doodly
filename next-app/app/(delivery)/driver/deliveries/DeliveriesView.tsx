"use client";

import { StateGate, EmptyState } from "@/components/account/ui";
import { useRoute, StopCard, isToday } from "@/components/driver/board";

export function DeliveriesView() {
  const { data, state, reload } = useRoute();
  const stops = (data?.stops ?? [])
    .filter((s) => isToday(s.date))
    .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));

  return (
    <StateGate state={state} signedOutTitle="Sign in to see your deliveries" signedOutBody="Your assigned deliveries appear here once you're signed in.">
      {stops.length === 0 ? (
        <EmptyState title="No deliveries today" body="You have no stops assigned for today." />
      ) : (
        <div className="space-y-4">
          {stops.map((s) => <StopCard key={s.id} stop={s} reload={reload} />)}
        </div>
      )}
    </StateGate>
  );
}
