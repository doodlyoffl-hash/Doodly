"use client";

import { StateGate, EmptyState } from "@/components/account/ui";
import { useRoute, StopCard, isToday } from "@/components/driver/board";

export function CompletedView() {
  const { data, state, reload } = useRoute();
  const stops = (data?.stops ?? [])
    .filter((s) => isToday(s.date) && ["DELIVERED", "FAILED", "SKIPPED"].includes(s.status))
    .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));

  return (
    <StateGate state={state} signedOutTitle="Sign in to see completed stops">
      {stops.length === 0 ? (
        <EmptyState title="Nothing completed yet" body="Finished deliveries will show up here." />
      ) : (
        <div className="space-y-4">
          {stops.map((s) => <StopCard key={s.id} stop={s} reload={reload} />)}
        </div>
      )}
    </StateGate>
  );
}
