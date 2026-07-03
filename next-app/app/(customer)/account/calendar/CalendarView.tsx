"use client";

import { useMemo, useState } from "react";
import { useResource, StateGate, Card } from "@/components/account/ui";
import type { Delivery } from "@/components/account/delivery-types";

const DOT: Record<string, string> = {
  DELIVERED: "bg-leaf", FAILED: "bg-red-500", SKIPPED: "bg-gray-400",
};
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function CalendarView() {
  const { data, state } = useResource<{ deliveries: Delivery[] }>("/api/deliveries");
  const [offset, setOffset] = useState(0); // months from current

  const byDay = useMemo(() => {
    const m = new Map<string, Delivery[]>();
    for (const d of data?.deliveries ?? []) {
      const k = dayKey(new Date(d.date));
      (m.get(k) ?? m.set(k, []).get(k)!).push(d);
    }
    return m;
  }, [data]);

  const view = new Date();
  view.setDate(1);
  view.setMonth(view.getMonth() + offset);
  const year = view.getFullYear(), month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(new Date());
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <StateGate state={state} signedOutTitle="Sign in to see your calendar" signedOutBody="Your delivery calendar appears here once you're signed in.">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setOffset((o) => o - 1)} className="rounded-full border border-mint-soft px-3 py-1 text-sm text-ink-2 hover:bg-[#F6FAF6]" aria-label="Previous month">←</button>
          <p className="font-display text-lg font-semibold text-forest">{view.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
          <button onClick={() => setOffset((o) => o + 1)} className="rounded-full border border-mint-soft px-3 py-1 text-sm text-ink-2 hover:bg-[#F6FAF6]" aria-label="Next month">→</button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />;
            const k = `${year}-${month}-${day}`;
            const items = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            return (
              <div key={k} className={`min-h-[64px] rounded-xl border p-1.5 text-left ${isToday ? "border-leaf bg-mint-soft/40" : "border-mint-soft"}`}>
                <div className={`text-xs font-semibold ${isToday ? "text-leaf-600" : "text-ink-2"}`}>{day}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {items.map((d) => <span key={d.id} title={`${d.slot ?? ""} ${d.status}`} className={`h-2 w-2 rounded-full ${DOT[d.status] ?? "bg-amber-400"}`} />)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-3">
          <Legend cls="bg-amber-400" label="Scheduled" />
          <Legend cls="bg-leaf" label="Delivered" />
          <Legend cls="bg-gray-400" label="Skipped" />
          <Legend cls="bg-red-500" label="Failed" />
        </div>
      </Card>
    </StateGate>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${cls}`} />{label}</span>;
}
