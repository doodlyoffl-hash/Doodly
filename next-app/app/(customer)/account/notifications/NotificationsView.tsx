"use client";

import { useResource, StateGate, Card, EmptyState, apiSend, fmtDateTime } from "@/components/account/ui";

interface Notif { id: string; channel: string; title: string; body: string; readAt: string | null; createdAt: string }
const ICON: Record<string, string> = { SMS: "💬", WHATSAPP: "🟢", PUSH: "🔔", EMAIL: "✉️" };

export function NotificationsView() {
  const { data, state, reload } = useResource<{ notifications: Notif[]; unread: number }>("/api/notifications");
  const notifs = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  async function markRead(id: string) { if ((await apiSend("/api/notifications", "PATCH", { id })).ok) reload(); }
  async function markAll() { if ((await apiSend("/api/notifications", "PATCH", { all: true })).ok) reload(); }

  return (
    <StateGate state={state} signedOutTitle="Sign in to see notifications" signedOutBody="Your delivery updates and alerts appear here once you're signed in.">
      <div className="space-y-4">
        {unread > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-forest">{unread} unread</p>
            <button onClick={markAll} className="rounded-full border border-mint-soft px-4 py-1.5 text-sm font-semibold text-forest hover:bg-[#F6FAF6]">Mark all as read</button>
          </div>
        )}

        {notifs.length === 0 ? (
          <EmptyState title="No notifications yet" body="We'll let you know about deliveries, offers and account activity here." />
        ) : (
          <div className="space-y-3">
            {notifs.map((n) => {
              const unreadItem = !n.readAt;
              return (
                <Card key={n.id} className={unreadItem ? "border-leaf/40 bg-mint-soft/20" : ""}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl" aria-hidden="true">{ICON[n.channel] ?? "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-forest">{n.title}</p>
                        {unreadItem && <span className="h-2 w-2 rounded-full bg-leaf" aria-label="unread" />}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>
                      <p className="mt-1 text-xs text-ink-3">{fmtDateTime(n.createdAt)}</p>
                    </div>
                    {unreadItem && <button onClick={() => markRead(n.id)} className="shrink-0 text-xs font-semibold text-leaf-600 hover:underline">Mark read</button>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StateGate>
  );
}
