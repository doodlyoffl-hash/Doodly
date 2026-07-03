"use client";

import { StateGate, EmptyState } from "@/components/account/ui";
import { useRoute, StopCard, DONE, isToday } from "@/components/driver/board";

export function RouteView() {
  const { data, state, reload } = useRoute();
  const stops = (data?.stops ?? [])
    .filter((s) => isToday(s.date) && !DONE(s.status))
    .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));

  return (
    <StateGate state={state} signedOutTitle="Sign in to see your route" signedOutBody="Your assigned stops appear here once you're signed in.">
      {stops.length === 0 ? (
        <EmptyState title="No stops left today" body="Every delivery on today's route is done. Nice work! 🥛" />
      ) : (
        <div className="space-y-4">
          {stops.map((s) => <StopCard key={s.id} stop={s} reload={reload} />)}
        </div>
      )}
    </StateGate>
  );
}
